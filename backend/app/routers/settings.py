from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

ALLOWED_KEYS = {"ntfy_url", "ntfy_topic", "notification_hour"}


@router.get("", response_model=List[schemas.SettingOut])
def list_settings(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return db.query(models.Setting).all()


@router.get("/{key}", response_model=schemas.SettingOut)
def get_setting(
    key: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
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
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting:
        setting = models.Setting(key=key, value=payload.value)
        db.add(setting)
    else:
        setting.value = payload.value
    db.commit()
    db.refresh(setting)
    return setting
