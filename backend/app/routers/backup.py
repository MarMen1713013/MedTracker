import os
import gzip
import subprocess
import shutil
from datetime import datetime
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = Path("/backups")


def _ensure_backup_dir():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _get_backup_files() -> List[schemas.BackupFile]:
    _ensure_backup_dir()
    files = []
    for f in sorted(BACKUP_DIR.glob("medtracker_*.sql.gz"), reverse=True):
        stat = f.stat()
        # parse timestamp from filename: medtracker_YYYYMMDD_HHMMSS.sql.gz
        try:
            ts_str = f.stem.replace("medtracker_", "").replace(".sql", "")
            ts = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
        except ValueError:
            ts = datetime.fromtimestamp(stat.st_mtime)
        files.append(schemas.BackupFile(
            filename=f.name,
            size_bytes=stat.st_size,
            created_at=ts,
        ))
    return files


def create_backup() -> str:
    _ensure_backup_dir()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"medtracker_{timestamp}.sql.gz"
    filepath = BACKUP_DIR / filename

    pg_dump_cmd = [
        "pg_dump",
        f"--host={settings.postgres_host}",
        f"--username={settings.postgres_user}",
        f"--dbname={settings.postgres_db}",
        "--format=plain",
        "--no-owner",
        "--no-acl",
        "--clean",
        "--if-exists",
        "--exclude-table=users",
    ]

    env = os.environ.copy()
    env["PGPASSWORD"] = settings.postgres_password

    result = subprocess.run(pg_dump_cmd, capture_output=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.decode()}")

    with gzip.open(filepath, "wb") as gz_file:
        gz_file.write(result.stdout)

    return filename


@router.get("", response_model=List[schemas.BackupFile])
def list_backups(_: models.User = Depends(get_current_user)):
    return _get_backup_files()


@router.post("/create", response_model=schemas.BackupFile, status_code=201)
def trigger_backup(_: models.User = Depends(get_current_user)):
    try:
        filename = create_backup()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    files = _get_backup_files()
    for f in files:
        if f.filename == filename:
            return f
    raise HTTPException(status_code=500, detail="Backup created but not found")


@router.post("/upload", response_model=schemas.BackupFile, status_code=201)
async def upload_backup(
    file: UploadFile = File(...),
    _: models.User = Depends(get_current_user),
):
    if not file.filename or not file.filename.endswith(".sql.gz"):
        raise HTTPException(status_code=400, detail="Il file deve essere un .sql.gz")
    _ensure_backup_dir()
    # Use the original filename if it matches the convention, otherwise timestamp it
    safe_name = Path(file.filename).name
    if not safe_name.startswith("medtracker_"):
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_name = f"medtracker_imported_{timestamp}.sql.gz"
    filepath = BACKUP_DIR / safe_name
    content = await file.read()
    # Validate it's actually gzip
    if not content[:2] == b"\x1f\x8b":
        raise HTTPException(status_code=400, detail="Il file non è un archivio gzip valido")
    filepath.write_bytes(content)
    stat = filepath.stat()
    try:
        ts_str = safe_name.replace("medtracker_", "").replace(".sql.gz", "").replace("imported_", "")
        ts = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
    except ValueError:
        ts = datetime.fromtimestamp(stat.st_mtime)
    return schemas.BackupFile(filename=safe_name, size_bytes=stat.st_size, created_at=ts)


@router.get("/download/{filename}")
def download_backup(
    filename: str,
    _: models.User = Depends(get_current_user),
):
    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not filename.startswith("medtracker_"):
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/gzip",
    )


@router.post("/restore/{filename}", status_code=200)
def restore_backup(
    filename: str,
    _: models.User = Depends(get_current_user),
):
    if not filename.startswith("medtracker_") or not filename.endswith(".sql.gz"):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")

    env = os.environ.copy()
    env["PGPASSWORD"] = settings.postgres_password

    with gzip.open(filepath, "rb") as gz_file:
        raw = gz_file.read().decode("utf-8", errors="replace")

    # Filter out parameters unsupported by this PostgreSQL version
    filtered = "\n".join(
        line for line in raw.splitlines()
        if "transaction_timeout" not in line
    ).encode()

    psql_cmd = [
        "psql",
        f"--host={settings.postgres_host}",
        f"--username={settings.postgres_user}",
        f"--dbname={settings.postgres_db}",
    ]

    # Pre-truncate non-user tables so old-style backups (without --clean) also work
    truncate_sql = (
        "TRUNCATE TABLE stock_entries, therapies, medications, settings "
        "RESTART IDENTITY CASCADE;\n"
    ).encode()
    subprocess.run(psql_cmd, input=truncate_sql, capture_output=True, env=env)

    result = subprocess.run(psql_cmd, input=filtered, capture_output=True, env=env)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Restore failed: {result.stderr.decode()}"
        )

    return {"detail": f"Restored from {filename} successfully"}


@router.delete("/{filename}", status_code=204)
def delete_backup(
    filename: str,
    _: models.User = Depends(get_current_user),
):
    if not filename.startswith("medtracker_"):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    filepath.unlink()
