from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Team
from schemas import TeamCreate, TeamResponse
from typing import List

router = APIRouter(prefix="/teams", tags=["teams"])

@router.get("/", response_model=List[TeamResponse])
def get_teams(db: Session = Depends(get_db)):
    return db.query(Team).all()

@router.post("/", response_model=TeamResponse)
def create_team(team: TeamCreate, db: Session = Depends(get_db)):
    new_team = Team(**team.model_dump())
    db.add(new_team)
    db.commit()
    db.refresh(new_team)
    return new_team