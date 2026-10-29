"""OpenStreetMap data management: local PBF status, explicit download / check / update / import."""

from dataclasses import asdict

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db, utcnow
from app.services.app_settings import get_json, set_json
from app.services.osm.pbf import files
from app.services.osm.pbf.importer import import_pbf
from app.services.osm.pbf.jobs import JobBusy, jobs

router = APIRouter(prefix="/osm-data", tags=["osm-data"])

JOB_KINDS = ("download", "update", "import")


def _status(db: Session) -> dict:
    settings = get_settings()
    job = jobs.current
    pbf = files.info_dict(settings.pbf_file)
    last_check = get_json(db, "osm.last_check")
    if last_check:
        # "Behind" is always relative to the file as it is now (it changes after an update or download).
        latest, local = last_check["remote"].get("latest_sequence"), (pbf or {}).get("replication_sequence")
        last_check["behind_by"] = max(0, latest - local) if latest is not None and local is not None else None
    return {
        "source_url": settings.osm_pbf_url,
        "file_name": settings.osm_pbf_name,
        "pbf": pbf,
        "job": asdict(job) if job else None,
        "last_check": last_check,
        **{f"last_{k}": get_json(db, f"osm.last_{k}") for k in JOB_KINDS},
    }


@router.get("")
def get_status(db: Session = Depends(get_db)) -> dict:
    return _status(db)


@router.post("/check")
def check(db: Session = Depends(get_db)) -> dict:
    """Compare the local file with Geofabrik. Transfers a few KB of metadata — never the extract itself."""
    settings = get_settings()
    local = files.info_dict(settings.pbf_file)
    try:
        remote = files.fetch_remote_info(settings, updates_url=(local or {}).get("replication_url"))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach the download server: {exc}") from exc
    set_json(db, "osm.last_check", {"checked_at": utcnow().isoformat(), "remote": asdict(remote)})
    return _status(db)


def _start(kind: str, work) -> dict:
    try:
        jobs.start(kind, work)
    except JobBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    with SessionLocal() as db:
        return _status(db)


@router.post("/download")
def download() -> dict:
    """Explicit user action only: streams the full extract (hundreds of MB)."""
    settings = get_settings()

    def work(job, cancel):
        job.report("Downloading")
        info = files.download_pbf(settings, cancel=cancel, progress=lambda done, total: job.report("Downloading", done, total))
        return {"pbf": asdict(info), "_message": "Download complete and verified."}

    return _start("download", work)


@router.post("/update")
def update() -> dict:
    settings = get_settings()
    if not settings.pbf_file.exists():
        raise HTTPException(status_code=409, detail="No local OSM file yet — download it first.")

    def work(job, cancel):
        job.report("Applying OpenStreetMap changes")
        result = files.update_pbf(settings, cancel=cancel)
        out = {"_status": "unavailable" if result.status == "unavailable" else "succeeded", "_message": result.message, "update": result.status}
        if result.info:
            out["pbf"] = asdict(result.info)
        return out

    return _start("update", work)


@router.post("/import")
def import_data() -> dict:
    settings = get_settings()
    if not settings.pbf_file.exists():
        raise HTTPException(status_code=409, detail="No local OSM file yet — download it first.")

    def work(job, cancel):
        from app.services.backup.service import create_backup

        job.report("Backing up your database")
        backup = create_backup(manual=True)  # restore point before touching the registry
        with SessionLocal() as db:
            summary = import_pbf(db, settings.pbf_file, cancel=cancel, progress=job.report)
        return {
            "backup": backup.name,
            "run_id": summary.run_id,
            "found": summary.found,
            "new": summary.new,
            "known": summary.known,
            "outside_city": summary.stats.outside,
            "data_timestamp": summary.data_timestamp,
            "by_sector": {name: asdict(st) for name, st in summary.by_sector.items()},
            "_message": f"{summary.new} new business{'' if summary.new == 1 else 'es'} added to the review queue · {summary.known} already known.",
        }

    return _start("import", work)


@router.post("/cancel")
def cancel(db: Session = Depends(get_db)) -> dict:
    jobs.cancel()
    return _status(db)
