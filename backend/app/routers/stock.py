from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user
from app.services.calculator import compute_stock_level

router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("/levels", response_model=List[schemas.StockLevel])
def get_stock_levels(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    medications = db.query(models.Medication).order_by(models.Medication.name).all()
    levels = [compute_stock_level(med) for med in medications]
    # Sort by urgency: medications with active therapies first, sorted by days_remaining asc
    def sort_key(sl: schemas.StockLevel):
        if sl.days_remaining is None:
            return (1, 0)
        return (0, float(sl.days_remaining))
    levels.sort(key=sort_key)
    return levels


@router.get("/levels/{medication_id}", response_model=schemas.StockLevel)
def get_stock_level(
    medication_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    med = db.query(models.Medication).filter(models.Medication.id == medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    return compute_stock_level(med)


@router.post("/entries", response_model=schemas.StockEntryOut, status_code=201)
def add_stock_entry(
    payload: schemas.StockEntryCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    med = db.query(models.Medication).filter(models.Medication.id == payload.medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    entry = models.StockEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/entries", response_model=List[schemas.StockEntryOut])
def list_stock_entries(
    medication_id: int = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.StockEntry)
    if medication_id is not None:
        q = q.filter(models.StockEntry.medication_id == medication_id)
    return q.order_by(models.StockEntry.created_at.desc()).all()


@router.patch("/entries/{entry_id}", response_model=schemas.StockEntryOut)
def update_stock_entry(
    entry_id: int,
    payload: schemas.StockEntryUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    entry = db.query(models.StockEntry).filter(models.StockEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_stock_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    entry = db.query(models.StockEntry).filter(models.StockEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    db.delete(entry)
    db.commit()
