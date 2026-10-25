import os
import gzip
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import List
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import SessionLocal, get_db
from app import models, schemas
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = Path("/backups")
BACKUP_TABLES = (
    "medications",
    "stock_entries",
)
APP_TIMEZONE = ZoneInfo(settings.tz)


def _ensure_backup_dir():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _is_supported_backup_name(filename: str) -> bool:
    return filename.startswith("medtracker_") and (
        filename.endswith(".sql.gz") or filename.endswith(".sql")
    )


def _parse_backup_timestamp(path: Path) -> datetime:
    stat = path.stat()
    stem = path.name
    if stem.endswith(".sql.gz"):
        stem = stem[:-7]
    elif stem.endswith(".sql"):
        stem = stem[:-4]
    if stem.startswith("medtracker_imported_"):
        stem = stem.replace("medtracker_imported_", "", 1)
    elif stem.startswith("medtracker_"):
        stem = stem.replace("medtracker_", "", 1)
    try:
        return datetime.strptime(stem, "%Y%m%d_%H%M%S").replace(tzinfo=APP_TIMEZONE)
    except ValueError:
        return datetime.fromtimestamp(stat.st_mtime, tz=APP_TIMEZONE)


def _sanitize_restore_sql(raw: str) -> bytes:
    keep_statement_prefixes = (
        "SET statement_timeout",
        "SET lock_timeout",
        "SET idle_in_transaction_session_timeout",
        "SET client_encoding",
        "SET standard_conforming_strings",
        "SELECT pg_catalog.set_config('search_path'",
        "SET check_function_bodies",
        "SET xmloption",
        "SET client_min_messages",
        "SET row_security",
    )
    keep_copy_prefixes = (
        "COPY public.medications ",
        "COPY public.stock_entries ",
    )
    keep_setval_prefixes = (
        "SELECT pg_catalog.setval('public.medications_id_seq'",
        "SELECT pg_catalog.setval('public.stock_entries_id_seq'",
    )

    filtered_lines: List[str] = []
    lines = raw.splitlines()
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if "transaction_timeout" in line:
            index += 1
            continue
        if stripped.startswith("\\restrict") or stripped.startswith("\\unrestrict"):
            index += 1
            continue
        if any(stripped.startswith(prefix) for prefix in keep_statement_prefixes):
            filtered_lines.append(line)
            index += 1
            continue
        if any(stripped.startswith(prefix) for prefix in keep_setval_prefixes):
            filtered_lines.append(line)
            index += 1
            continue
        if any(stripped.startswith(prefix) for prefix in keep_copy_prefixes):
            filtered_lines.append(line)
            index += 1
            while index < len(lines):
                filtered_lines.append(lines[index])
                if lines[index].strip() == "\\.":
                    index += 1
                    break
                index += 1
            continue

        index += 1

    return ("\n".join(filtered_lines) + "\n").encode()


def _read_backup_sql(filepath: Path) -> bytes:
    if filepath.name.endswith(".sql.gz"):
        with gzip.open(filepath, "rb") as gz_file:
            return gz_file.read()
    return filepath.read_bytes()


def _get_backup_files() -> List[schemas.BackupFile]:
    _ensure_backup_dir()
    files = []
    backup_paths = sorted(
        [path for path in BACKUP_DIR.iterdir() if path.is_file() and _is_supported_backup_name(path.name)],
        reverse=True,
    )
    for f in backup_paths:
        stat = f.stat()
        files.append(schemas.BackupFile(
            filename=f.name,
            size_bytes=stat.st_size,
            created_at=_parse_backup_timestamp(f),
        ))
    return files


def create_backup() -> str:
    _ensure_backup_dir()
    timestamp = datetime.now(APP_TIMEZONE).strftime("%Y%m%d_%H%M%S")
    filename = f"medtracker_{timestamp}.sql.gz"
    filepath = BACKUP_DIR / filename

    pg_dump_cmd = [
        "pg_dump",
        f"--host={settings.postgres_host}",
        f"--username={settings.postgres_user}",
        f"--dbname={settings.postgres_db}",
        "--format=plain",
        "--data-only",
        "--no-owner",
        "--no-acl",
    ]
    for table in BACKUP_TABLES:
        pg_dump_cmd.append(f"--table=public.{table}")

    env = os.environ.copy()
    env["PGPASSWORD"] = settings.postgres_password

    result = subprocess.run(pg_dump_cmd, capture_output=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.decode()}")

    with gzip.open(filepath, "wb") as gz_file:
        gz_file.write(result.stdout)

    return filename


def get_backup_retention_days() -> int:
    db = SessionLocal()
    try:
        configured = (
            db.query(models.Setting)
            .filter(models.Setting.key == "backup_retention_days")
            .first()
        )
        if configured and configured.value is not None:
            try:
                value = int(configured.value)
                if 0 <= value <= 3650:
                    return value
            except ValueError:
                pass
        return max(0, min(settings.backup_retention_days, 3650))
    finally:
        db.close()


def prune_expired_backups(
    retention_days: int,
    now: datetime | None = None,
) -> List[str]:
    """Delete expired backup files while always preserving the newest one."""
    if retention_days <= 0:
        return []

    _ensure_backup_dir()
    paths = [
        path
        for path in BACKUP_DIR.iterdir()
        if path.is_file() and _is_supported_backup_name(path.name)
    ]
    if not paths:
        return []

    reference_time = now or datetime.now(APP_TIMEZONE)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=APP_TIMEZONE)
    cutoff = reference_time - timedelta(days=retention_days)
    newest = max(paths, key=_parse_backup_timestamp)

    deleted = []
    for path in paths:
        if path != newest and _parse_backup_timestamp(path) < cutoff:
            path.unlink()
            deleted.append(path.name)
    return sorted(deleted)


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
    if not file.filename or not (
        file.filename.endswith(".sql.gz") or file.filename.endswith(".sql")
    ):
        raise HTTPException(status_code=400, detail="Il file deve essere un .sql o .sql.gz")
    _ensure_backup_dir()
    # Use the original filename if it matches the convention, otherwise timestamp it
    safe_name = Path(file.filename).name
    suffix = ".sql.gz" if safe_name.endswith(".sql.gz") else ".sql"
    if not safe_name.startswith("medtracker_"):
        timestamp = datetime.now(APP_TIMEZONE).strftime("%Y%m%d_%H%M%S")
        safe_name = f"medtracker_imported_{timestamp}{suffix}"
    filepath = BACKUP_DIR / safe_name
    content = await file.read()
    if safe_name.endswith(".sql.gz") and content[:2] != b"\x1f\x8b":
        raise HTTPException(status_code=400, detail="Il file non è un archivio gzip valido")
    filepath.write_bytes(content)
    stat = filepath.stat()
    return schemas.BackupFile(
        filename=safe_name,
        size_bytes=stat.st_size,
        created_at=_parse_backup_timestamp(filepath),
    )


@router.get("/download/{filename}")
def download_backup(
    filename: str,
    _: models.User = Depends(get_current_user),
):
    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not _is_supported_backup_name(filename):
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/gzip" if filename.endswith(".gz") else "application/sql",
    )


@router.post("/restore/{filename}", status_code=200)
def restore_backup(
    filename: str,
    _: models.User = Depends(get_current_user),
):
    if not _is_supported_backup_name(filename):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")

    env = os.environ.copy()
    env["PGPASSWORD"] = settings.postgres_password

    raw = _read_backup_sql(filepath).decode("utf-8", errors="replace")
    filtered = _sanitize_restore_sql(raw)

    psql_cmd = [
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-X",
        f"--host={settings.postgres_host}",
        f"--username={settings.postgres_user}",
        f"--dbname={settings.postgres_db}",
    ]

    # Reset medications and stock, and clear therapies that would otherwise
    # reference restored medications inconsistently.
    truncate_sql = (
        "TRUNCATE TABLE stock_entries, therapies, medications "
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
    if not _is_supported_backup_name(filename):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    filepath.unlink()
