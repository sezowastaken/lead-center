from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

# The user's real prospecting database. Only the "user" profile may ever open it.
USER_DATABASE = Path("data/lead_center.db")
SANDBOX_DATABASE = Path("data/sandbox/lead_center_sandbox.db")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LEAD_CENTER_",
        env_file=REPO_ROOT / ".env",
        extra="ignore",
    )

    # "user"    — the real database (LeadCenter.bat).
    # "sandbox" — a disposable database for browser/manual testing (python -m app.sandbox).
    # Automated tests use their own temporary databases.
    profile: Literal["user", "sandbox"] = "user"
    database_path: Path | None = None

    # Public Overpass is for P0 / prototyping only (spec §5.1, ADR-003).
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    overpass_contact: str = ""
    overpass_timeout_seconds: int = 90
    overpass_max_retries: int = 2
    overpass_cache_ttl_hours: int = 24

    # Local OSM extract (spec §5.2, §16). Downloaded only on explicit user action.
    osm_pbf_url: str = "https://download.geofabrik.de/europe/turkey-latest.osm.pbf"
    osm_updates_url: str = "https://download.geofabrik.de/europe/turkey-updates"
    osm_pbf_name: str = "turkey-latest.osm.pbf"

    frontend_dist: Path = Path("frontend/dist")

    @model_validator(mode="after")
    def _isolate_sandbox(self) -> "Settings":
        if self.database_path is None:
            self.database_path = SANDBOX_DATABASE if self.profile == "sandbox" else USER_DATABASE
        if self.profile == "sandbox" and self.database_file.resolve() == self.resolve(USER_DATABASE).resolve():
            raise ValueError("The sandbox profile must never use the real database (data/lead_center.db)")
        return self

    def resolve(self, path: Path) -> Path:
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def database_file(self) -> Path:
        assert self.database_path is not None
        return self.resolve(self.database_path)

    @property
    def is_user_database(self) -> bool:
        return self.database_file.resolve() == self.resolve(USER_DATABASE).resolve()

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_file.as_posix()}"

    @property
    def osm_dir(self) -> Path:
        """Per profile, next to the database: data/osm/ (real) or data/sandbox/osm/ (sandbox)."""
        return self.database_file.parent / "osm"

    @property
    def pbf_file(self) -> Path:
        return self.osm_dir / self.osm_pbf_name

    @property
    def cache_dir(self) -> Path:
        return REPO_ROOT / "data" / "cache" / "overpass"

    @property
    def frontend_dist_dir(self) -> Path:
        return self.resolve(self.frontend_dist)

    @property
    def user_agent(self) -> str:
        ua = "LeadCenter/0.1 (local personal prototype; low-volume)"
        if self.overpass_contact:
            ua = f"LeadCenter/0.1 (local personal prototype; low-volume; {self.overpass_contact})"
        return ua


@lru_cache
def get_settings() -> Settings:
    return Settings()
