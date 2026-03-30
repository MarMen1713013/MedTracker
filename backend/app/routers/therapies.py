from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/therapies", tags=["therapies"])


def _get_therapy_or_404(therapy_id: int, user_id: int, db: Session) -> models.Therapy:
    therapy = db.query(models.Therapy).filter(models.Therapy.id == therapy_id).first()
    if not therapy:
        raise HTTPException(status_code=404, detail="Therapy not found")
    # Allow access if therapy has no owner (legacy data) or if owner matches
    if therapy.user_id is not None and therapy.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your therapy")
    return therapy


@router.get("", response_model=List[schemas.TherapyOut])
def list_therapies(
    medication_id: int = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Therapy).filter(
        (models.Therapy.user_id == current_user.id) | (models.Therapy.user_id.is_(None))
    )
    if medication_id is not None:
        q = q.filter(models.Therapy.medication_id == medication_id)
    return q.order_by(models.Therapy.start_date.desc()).all()


@router.post("", response_model=schemas.TherapyOut, status_code=201)
def create_therapy(
    payload: schemas.TherapyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    med = db.query(models.Medication).filter(models.Medication.id == payload.medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    therapy = models.Therapy(**payload.model_dump(), user_id=current_user.id)
    db.add(therapy)
    db.commit()
    db.refresh(therapy)
    return therapy


@router.get("/{therapy_id}", response_model=schemas.TherapyOut)
def get_therapy(
    therapy_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _get_therapy_or_404(therapy_id, current_user.id, db)


@router.patch("/{therapy_id}", response_model=schemas.TherapyOut)
def update_therapy(
    therapy_id: int,
    payload: schemas.TherapyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    therapy = _get_therapy_or_404(therapy_id, current_user.id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(therapy, field, value)
    db.commit()
    db.refresh(therapy)
    return therapy


@router.post("/{therapy_id}/activate", response_model=schemas.TherapyOut)
def activate_therapy(
    therapy_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    therapy = _get_therapy_or_404(therapy_id, current_user.id, db)
    therapy.is_active = True
    db.commit()
    db.refresh(therapy)
    return therapy


@router.post("/{therapy_id}/deactivate", response_model=schemas.TherapyOut)
def deactivate_therapy(
    therapy_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    therapy = _get_therapy_or_404(therapy_id, current_user.id, db)
    therapy.is_active = False
    db.commit()
    db.refresh(therapy)
    return therapy


@router.delete("/{therapy_id}", status_code=204)
def delete_therapy(
    therapy_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    therapy = _get_therapy_or_404(therapy_id, current_user.id, db)
    db.delete(therapy)
    db.commit()
