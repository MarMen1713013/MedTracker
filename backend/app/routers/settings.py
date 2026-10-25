from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user
from app.config import settings as app_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])

ALLOWED_KEYS = {
    "ntfy_url",
    "ntfy_topic",
    "notification_hour",
    "backup_retention_days",
}

INTEGER_SETTING_RANGES = {
    "notification_hour": (0, 23),
    "backup_retention_days": (0, 3650),
}


def _validate_setting_value(key: str, value: str | None) -> str | None:
    if key not in INTEGER_SETTING_RANGES or value is None:
        return value
    minimum, maximum = INTEGER_SETTING_RANGES[key]
    try:
        numeric_value = int(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{key} must be an integer") from exc
    if not minimum <= numeric_value <= maximum:
        raise HTTPException(
            status_code=422,
            detail=f"{key} must be between {minimum} and {maximum}",
        )
    return str(numeric_value)


@router.get("", response_model=List[schemas.SettingOut])
def list_settings(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    stored_settings = db.query(models.Setting).all()
    stored_keys = {setting.key for setting in stored_settings}
    if "backup_retention_days" not in stored_keys:
        stored_settings.append({
            "key": "backup_retention_days",
            "value": str(app_settings.backup_retention_days),
        })
    return stored_settings


@router.get("/{key}", response_model=schemas.SettingOut)
def get_setting(
    key: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting and key == "backup_retention_days":
        return {
            "key": "backup_retention_days",
            "value": str(app_settings.backup_retention_days),
        }
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.put("/{key}", response_model=schemas.SettingOut)
def update_setting(
    key: str,
    payload: schemas.SettingUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {key}")
    value = _validate_setting_value(key, payload.value)
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting:
        setting = models.Setting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    db.refresh(setting)
    return setting
