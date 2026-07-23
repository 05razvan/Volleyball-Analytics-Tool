from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Match, MatchStats
from schemas import MatchCreate, MatchResponse, MatchStatsCreate, MatchStatsResponse
from typing import List

router = APIRouter(prefix="/matches", tags=["matches"])

@router.get("/", response_model=List[MatchResponse])
def get_matches(db: Session = Depends(get_db)):
    return db.query(Match).all()

@router.get("/{match_id}", response_model=MatchResponse)
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match

@router.post("/", response_model=MatchResponse)
def create_match(match: MatchCreate, db: Session = Depends(get_db)):
    new_match = Match(**match.model_dump())
    db.add(new_match)
    db.commit()
    db.refresh(new_match)
    return new_match

@router.patch("/{match_id}/score")
def update_score(match_id: int, home_score: int, away_score: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    match.home_score = home_score
    match.away_score = away_score
    db.commit()
    db.refresh(match)
    return match

@router.post("/stats", response_model=MatchStatsResponse)
def log_stats(stats: MatchStatsCreate, db: Session = Depends(get_db)):
    new_stats = MatchStats(**stats.model_dump())
    db.add(new_stats)
    db.commit()
    db.refresh(new_stats)
    return new_stats

@router.get("/{match_id}/stats", response_model=List[MatchStatsResponse])
def get_match_stats(match_id: int, db: Session = Depends(get_db)):
    return db.query(MatchStats).filter(MatchStats.match_id == match_id).all()