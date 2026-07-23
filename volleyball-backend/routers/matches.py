from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Match, MatchEvent, SetScore, Team
from schemas import MatchCreate, MatchResponse, MatchEventCreate, MatchEventResponse, SetScoreResponse
from typing import List

router = APIRouter(prefix="/matches", tags=["matches"])

POINTS_FOR_US = {"kill", "ace", "opponent_point"}
POINTS_FOR_THEM = {"serve_error"}

@router.get("/", response_model=List[MatchResponse])
def get_matches(db: Session = Depends(get_db)):
    return db.query(Match).all()

@router.post("/", response_model=MatchResponse)
def create_match(match: MatchCreate, db: Session = Depends(get_db)):
    home = db.query(Team).filter(Team.id == match.home_team_id).first()
    away = db.query(Team).filter(Team.id == match.away_team_id).first()
    if not home or not away:
        raise HTTPException(status_code=404, detail="Team not found")
    if home.division != away.division:
        raise HTTPException(status_code=400, detail="Teams must be in the same division")
    new_match = Match(**match.model_dump())
    db.add(new_match)
    db.commit()
    db.refresh(new_match)
    return new_match

@router.post("/{match_id}/start", response_model=MatchResponse)
def start_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    match.status = "live"
    db.commit()
    db.refresh(match)
    return match

@router.post("/{match_id}/event", response_model=MatchEventResponse)
def log_event(match_id: int, event: MatchEventCreate, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    new_event = MatchEvent(**event.model_dump())
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@router.delete("/{match_id}/event/undo", response_model=MatchEventResponse)
def undo_last_event(match_id: int, db: Session = Depends(get_db)):
    last = db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id
    ).order_by(MatchEvent.id.desc()).first()
    if not last:
        raise HTTPException(status_code=404, detail="No events to undo")
    db.delete(last)
    db.commit()
    return last

@router.post("/{match_id}/end-set")
def end_set(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    our, their = calculate_score(match_id, match.current_set, db)
    set_score = SetScore(
        match_id=match_id,
        set_number=match.current_set,
        our_score=our,
        opponent_score=their
    )
    db.add(set_score)
    match.current_set += 1
    db.commit()
    return {"message": f"Set {match.current_set - 1} ended", "our_score": our, "opponent_score": their}

@router.post("/{match_id}/complete")
def complete_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    our, their = calculate_score(match_id, match.current_set, db)
    set_score = SetScore(
        match_id=match_id,
        set_number=match.current_set,
        our_score=our,
        opponent_score=their
    )
    db.add(set_score)
    match.status = "completed"
    db.commit()
    return {"message": "Match completed"}

@router.get("/{match_id}/score")
def get_score(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    our, their = calculate_score(match_id, match.current_set, db)
    sets = db.query(SetScore).filter(SetScore.match_id == match_id).all()
    return {
        "current_set": match.current_set,
        "current_set_our": our,
        "current_set_opponent": their,
        "sets": [{"set": s.set_number, "us": s.our_score, "them": s.opponent_score} for s in sets],
        "status": match.status
    }

@router.get("/{match_id}/events", response_model=List[MatchEventResponse])
def get_events(match_id: int, db: Session = Depends(get_db)):
    return db.query(MatchEvent).filter(MatchEvent.match_id == match_id).order_by(MatchEvent.timestamp).all()

def calculate_score(match_id: int, set_number: int, db: Session):
    events = db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id,
        MatchEvent.set_number == set_number
    ).all()
    our = sum(1 for e in events if e.event_type in POINTS_FOR_US)
    their = sum(1 for e in events if e.event_type in POINTS_FOR_THEM)
    return our, their