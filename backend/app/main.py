import logging
import subprocess
import sys
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.routers import auth, medications, therapies, stock, backup, settings as settings_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migrations():
    logger.info("Running Alembic migrations...")
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        cwd="/app",
    )
    if result.returncode != 0:
        logger.error(f"Migration failed: {result.stderr}")
        sys.exit(1)
    logger.info(f"Migrations complete: {result.stdout}")


def run_daily_notifications():
    from app.services.notifications import check_and_notify
    logger.info("Running daily stock notifications check...")
    check_and_notify()


def run_daily_backup():
    from app.routers.backup import create_backup
    logger.info("Running daily backup...")
    try:
        filename = create_backup()
        logger.info(f"Daily backup created: {filename}")
    except Exception as e:
        logger.error(f"Daily backup failed: {e}")


scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()

    scheduler.add_job(
        run_daily_notifications,
        CronTrigger(hour=settings.notification_hour, minute=0),
        id="daily_notifications",
        replace_existing=True,
    )
    scheduler.add_job(
        run_daily_backup,
        CronTrigger(hour=settings.backup_cron_hour, minute=0),
        id="daily_backup",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"Scheduler started. Notifications at {settings.notification_hour}:00, "
        f"backups at {settings.backup_cron_hour}:00"
    )

    yield

    scheduler.shutdown()
    logger.info("Scheduler stopped.")


app = FastAPI(title="MedTracker", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(medications.router)
app.include_router(therapies.router)
app.include_router(stock.router)
app.include_router(backup.router)
app.include_router(settings_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve frontend static files if the build directory exists (production)
_static_dir = Path("/app/static")
if _static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Serve specific root-level files (favicon, etc.)
        candidate = _static_dir / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_static_dir / "index.html"))
