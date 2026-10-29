"""Local PBF file inspection, download and incremental update (spec §16).

Safety rules shared by every operation:
- new data is written to a temporary file next to the working PBF;
- it is validated (size, checksum, readable PBF header) before an atomic os.replace;
- on cancel, error or failed validation the temporary file is removed and the previous PBF is untouched.
"""

import hashlib
import logging
import os
import subprocess
import sys
import threading
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin

import httpx

from app.config import Settings

log = logging.getLogger(__name__)

CHUNK = 1 << 20  # 1 MiB


class Cancelled(Exception):
    pass


class PBFError(Exception):
    pass


@dataclass
class PBFInfo:
    path: str
    size_bytes: int
    file_modified_at: str  # when the local file was written (download/update time), UTC ISO
    data_timestamp: str | None  # OSM data timestamp from the PBF header
    replication_sequence: int | None
    replication_url: str | None


def _header_value(header, key: str) -> str | None:
    value = header.get(key, "")
    return value or None


def _looks_like_pbf(path: Path) -> bool:
    """A PBF starts with a 4-byte big-endian BlobHeader length followed by a BlobHeader of type "OSMHeader".

    Checked in pure Python first so obviously wrong files (an HTML error page, a truncated start) never
    reach osmium, which on Windows can keep a handle open on files it fails to parse.
    """
    with open(path, "rb") as fh:
        size = int.from_bytes(fh.read(4), "big")
        return 0 < size < 64 * 1024 and b"OSMHeader" in fh.read(size)


def safe_unlink(path: Path) -> None:
    """Delete a temp file; on Windows retry briefly if a reader still holds it (startup cleanup is the fallback)."""
    import gc
    import time

    for attempt in range(5):
        try:
            path.unlink(missing_ok=True)
            return
        except PermissionError:
            gc.collect()
            time.sleep(0.2 * (attempt + 1))
    log.warning("Could not remove %s now; it will be removed at next start", path.name)


def read_pbf_info(path: Path) -> PBFInfo:
    """Read the PBF header without loading any data. Raises PBFError if the file is not a readable PBF."""
    import osmium

    if not path.exists() or path.stat().st_size == 0:
        raise PBFError(f"{path.name} does not exist or is empty")
    if not _looks_like_pbf(path):
        raise PBFError(f"{path.name} is not a PBF file")
    try:
        # Format is forced: temporary files (".part") have no recognisable extension.
        reader = osmium.io.Reader(osmium.io.File(str(path), "pbf"), osmium.osm.osm_entity_bits.NOTHING)
        try:
            header = reader.header()
            ts = _header_value(header, "osmosis_replication_timestamp") or _header_value(header, "timestamp")
            seq = _header_value(header, "osmosis_replication_sequence_number")
            url = _header_value(header, "osmosis_replication_base_url")
        finally:
            reader.close()
    except Exception as exc:  # noqa: BLE001 — osmium raises RuntimeError for corrupt input
        raise PBFError(f"{path.name} is not a valid PBF file: {exc}") from exc
    stat = path.stat()
    return PBFInfo(
        path=str(path),
        size_bytes=stat.st_size,
        file_modified_at=datetime.fromtimestamp(stat.st_mtime, UTC).replace(tzinfo=None).isoformat(),
        data_timestamp=ts,
        replication_sequence=int(seq) if seq and seq.isdigit() else None,
        replication_url=url,
    )


def info_dict(path: Path) -> dict | None:
    try:
        return asdict(read_pbf_info(path))
    except PBFError:
        return None


def cleanup_partials(osm_dir: Path) -> list[str]:
    """Remove leftovers of interrupted downloads/updates (e.g. after the app was closed mid-download)."""
    removed = []
    if osm_dir.exists():
        for p in osm_dir.iterdir():
            if p.name.endswith(".part") or ".part." in p.name or p.name.startswith("_import_"):
                p.unlink(missing_ok=True)
                removed.append(p.name)
    return removed


def _client(settings: Settings, transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": settings.user_agent},
        timeout=httpx.Timeout(60, connect=20),
        follow_redirects=True,
        transport=transport,
    )


@dataclass
class RemoteInfo:
    url: str  # resolved, dated file URL (turkey-latest redirects to e.g. turkey-261028.osm.pbf)
    size_bytes: int | None
    last_modified: str | None
    md5: str | None
    latest_sequence: int | None
    latest_timestamp: str | None


def _parse_state(text: str) -> tuple[int | None, str | None]:
    seq = ts = None
    for line in text.splitlines():
        if line.startswith("sequenceNumber="):
            seq = int(line.split("=", 1)[1].strip())
        elif line.startswith("timestamp="):
            ts = line.split("=", 1)[1].strip().replace("\\:", ":")
    return seq, ts


def fetch_remote_info(settings: Settings, *, updates_url: str | None = None, transport: httpx.BaseTransport | None = None) -> RemoteInfo:
    """A few KB of metadata: HEAD of the extract, its .md5 and the replication state. Never downloads the PBF."""
    with _client(settings, transport) as http:
        head = http.head(settings.osm_pbf_url)
        head.raise_for_status()
        url = str(head.url)
        size = int(head.headers["content-length"]) if head.headers.get("content-length", "").isdigit() else None
        md5 = None
        for candidate in (url + ".md5", settings.osm_pbf_url + ".md5"):
            r = http.get(candidate)
            if r.status_code == 200 and r.text.strip():
                md5 = r.text.split()[0].strip().lower()
                break
        seq = ts = None
        state_base = (updates_url or settings.osm_updates_url).rstrip("/") + "/"
        try:
            r = http.get(urljoin(state_base, "state.txt"))
            if r.status_code == 200:
                seq, ts = _parse_state(r.text)
        except httpx.HTTPError as exc:
            log.warning("Could not read replication state: %s", exc)
    return RemoteInfo(url=url, size_bytes=size, last_modified=head.headers.get("last-modified"), md5=md5, latest_sequence=seq, latest_timestamp=ts)


ProgressFn = Callable[[int, int | None], None]


def download_pbf(
    settings: Settings,
    *,
    cancel: threading.Event,
    progress: ProgressFn,
    transport: httpx.BaseTransport | None = None,
) -> PBFInfo:
    """Stream a full extract to <name>.part, validate, then atomically replace the working PBF."""
    settings.osm_dir.mkdir(parents=True, exist_ok=True)
    final = settings.pbf_file
    part = final.with_name(final.name + ".part")
    remote = fetch_remote_info(settings, transport=transport)
    digest = hashlib.md5()
    written = 0
    try:
        with _client(settings, transport) as http, http.stream("GET", remote.url) as resp:
            resp.raise_for_status()
            total = int(resp.headers["content-length"]) if resp.headers.get("content-length", "").isdigit() else remote.size_bytes
            progress(0, total)
            with open(part, "wb") as fh:
                for chunk in resp.iter_bytes(CHUNK):
                    if cancel.is_set():
                        raise Cancelled("Download cancelled")
                    fh.write(chunk)
                    digest.update(chunk)
                    written += len(chunk)
                    progress(written, total)
        if total is not None and written != total:
            raise PBFError(f"Download incomplete: got {written} of {total} bytes")
        if remote.md5 and digest.hexdigest() != remote.md5:
            raise PBFError("Checksum mismatch — the downloaded file is corrupt")
        read_pbf_info(part)  # must be a readable PBF
        os.replace(part, final)
    except BaseException:
        safe_unlink(part)
        raise
    log.info("PBF downloaded: %s (%d bytes, md5 %s)", final.name, written, "verified" if remote.md5 else "not published")
    return read_pbf_info(final)


def _up_to_date_executable() -> list[str]:
    scripts = Path(sys.executable).parent
    for name in ("pyosmium-up-to-date.exe", "pyosmium-up-to-date"):
        if (scripts / name).exists():
            return [str(scripts / name)]
    raise PBFError("pyosmium-up-to-date is not installed")


@dataclass
class UpdateResult:
    status: str  # "updated" | "partial" | "unavailable"
    message: str
    info: PBFInfo | None = None


def update_pbf(
    settings: Settings,
    *,
    cancel: threading.Event,
    command: list[str] | None = None,
    max_diff_mb: int = 500,
) -> UpdateResult:
    """Apply replication diffs with pyosmium-up-to-date into a temp file, validate, then replace.

    Returns status "unavailable" (and leaves the PBF untouched) when an incremental update cannot be done
    safely — the caller then offers a fresh full download.
    """
    final = settings.pbf_file
    current = read_pbf_info(final)
    if not current.replication_url or current.replication_sequence is None:
        return UpdateResult("unavailable", "This file has no replication information, so it can't be updated incrementally. Download a fresh copy instead.")

    tmp = final.with_name(final.name.replace(".osm.pbf", "") + ".part.osm.pbf")
    tmp.unlink(missing_ok=True)
    cmd = (command or _up_to_date_executable()) + ["-v", "--size", str(max_diff_mb), "-o", str(tmp), str(final)]
    log.info("Running %s", " ".join(cmd))
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        while True:
            try:
                output, _ = proc.communicate(timeout=1)
                break
            except subprocess.TimeoutExpired:
                if cancel.is_set():
                    proc.kill()
                    proc.communicate()
                    raise Cancelled("Update cancelled")
        code = proc.returncode
        tail = "\n".join((output or "").strip().splitlines()[-5:])
        if code > 1 or not tmp.exists():
            safe_unlink(tmp)
            if code == 0 and not tmp.exists():
                return UpdateResult("updated", "Already up to date.", current)
            return UpdateResult("unavailable", f"Incremental update failed (exit {code}). Download a fresh copy instead. {tail}".strip())
        new = read_pbf_info(tmp)
        if current.replication_sequence and new.replication_sequence and new.replication_sequence < current.replication_sequence:
            raise PBFError("Updated file is older than the current one")
        os.replace(tmp, final)
    except BaseException:
        safe_unlink(tmp)
        raise
    info = read_pbf_info(final)
    if code == 1:
        return UpdateResult("partial", "Some updates were applied; more are available — run Update again.", info)
    return UpdateResult("updated", "Updated to the latest data.", info)
