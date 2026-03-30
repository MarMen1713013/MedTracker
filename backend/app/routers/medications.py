from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/medications", tags=["medications"])


@router.get("", response_model=List[schemas.MedicationOut])
def list_medications(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return db.query(models.Medication).order_by(models.Medication.name).all()


@router.post("", response_model=schemas.MedicationOut, status_code=201)
def create_medication(
    payload: schemas.MedicationCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    med = models.Medication(**payload.model_dump())
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


@router.get("/{medication_id}", response_model=schemas.MedicationOut)
def get_medication(
    medication_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    med = db.query(models.Medication).filter(models.Medication.id == medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    return med


@router.patch("/{medication_id}", response_model=schemas.MedicationOut)
def update_medication(
    medication_id: int,
    payload: schemas.MedicationUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    med = db.query(models.Medication).filter(models.Medication.id == medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(med, field, value)
    db.commit()
    db.refresh(med)
    return med


@router.delete("/{medication_id}", status_code=204)
def delete_medication(
    medication_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    med = db.query(models.Medication).filter(models.Medication.id == medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    db.delete(med)
    db.commit()
