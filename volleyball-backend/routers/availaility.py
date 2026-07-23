from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Availability
from schemas import AvailabilityCreate, AvailabilityResponse
from typing import List

router = APIRouter(prefix="/availability", tags=["availability"])

@router.post("/", response_model=AvailabilityResponse)
def set_availability(availability: AvailabilityCreate, db: Session = Depends(get_db)):
    existing = db.query(Availability).filter(
        Availability.player_id == availability.player_id,
        Availability.match_id == availability.match_id
    ).first()
    if existing:
        existing.status = availability.status
        existing.note = availability.note
        db.commit()
        db.refresh(existing)
        return existing
    new_avail = Availability(**availability.model_dump())
    db.add(new_avail)
    db.commit()
    db.refresh(new_avail)
    return new_avail

@router.get("/{match_id}", response_model=List[AvailabilityResponse])
def get_availability(match_id: int, db: Session = Depends(get_db)):
    return db.query(Availability).filter(Availability.match_id == match_id).all()