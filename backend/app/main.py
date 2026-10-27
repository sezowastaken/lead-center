import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import businesses, discovery, health, leads, sectors_locations, system
from app.config import get_settings
from app.database import SessionLocal
from app.migrate import upgrade_to_head
from app.seed.loader import sync_seed_data
from app.services.backup.service import ensure_daily_backup

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("lead_center")

BACKUP_CHECK_SECONDS = 3600


async def _daily_backup_loop() -> None:
    # The app can stay open for days; check hourly whether today's backup exists.
    while True:
        await asyncio.sleep(BACKUP_CHECK_SECONDS)
        try:
            await asyncio.to_thread(ensure_daily_backup)
        except Exception:  # noqa: BLE001 — a failed backup must never take the app down
            log.exception("Automatic backup failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        ensure_daily_backup()  # before migrations, so an upgrade always has a restore point
    except Exception:  # noqa: BLE001
        log.exception("Startup backup failed")
    upgrade_to_head()
    with SessionLocal() as db:
        sync_seed_data(db)
    task = asyncio.create_task(_daily_backup_loop())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="Lead Center", version="0.1.0", lifespan=lifespan)

app.include_router(health.router, prefix="/api")
app.include_router(sectors_locations.router, prefix="/api")
app.include_router(discovery.router, prefix="/api")
app.include_router(businesses.router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(system.router, prefix="/api")


# Serve the built React app (launcher mode). In development, Vite on :5173 proxies /api here instead.
_dist = get_settings().frontend_dist_dir
if (_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(_dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
