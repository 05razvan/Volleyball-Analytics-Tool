from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Match, MatchEvent, SetScore, Team, Player
from schemas import MatchCreate, MatchResponse, MatchEventCreate, MatchEventResponse
from auth import get_current_user, require_coach_or_above, get_optional_user
from typing import List

router = APIRouter(prefix="/matches", tags=["matches"])

POINTS_FOR_US = {"kill", "ace", "our_point", "kill_block"}
POINTS_FOR_THEM = {"serve_error", "opponent_point"}

def calculate_score(match_id: int, set_number: int, db: Session):
    events = db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id,
        MatchEvent.set_number == set_number
    ).all()
    our = sum(1 for e in events if e.event_type in POINTS_FOR_US)
    their = sum(1 for e in events if e.event_type in POINTS_FOR_THEM)
    return our, their

def check_match_permission(match: Match, current_user, db: Session):
    """Only the coach/captain/admin of our_team_id can track stats."""
    if current_user.role == "admin":
        return
    team = db.query(Team).filter(
        (Team.head_coach_id == current_user.id) |
        (Team.assistant_coach_id == current_user.id)
    ).first()
    if team and team.id == match.our_team_id:
        return
    if current_user.player and current_user.player.team_id == match.our_team_id:
        if current_user.role == "captain":
            return
    raise HTTPException(status_code=403,
        detail="Only the tracking team's coach or captain can do this")

@router.get("/", response_model=List[MatchResponse])
def get_matches(db: Session = Depends(get_db)):
    return db.query(Match).all()

@router.post("/", response_model=MatchResponse)
def create_match(match: MatchCreate, db: Session = Depends(get_db),
                 current_user=Depends(require_coach_or_above)):
    home = db.query(Team).filter(Team.id == match.home_team_id).first()
    away = db.query(Team).filter(Team.id == match.away_team_id).first()
    if not home or not away:
        raise HTTPException(status_code=404, detail="Team not found")
    if home.division != away.division:
        raise HTTPException(status_code=400,
            detail="Teams must be in the same division")
    new_match = Match(**match.model_dump())
    db.add(new_match)
    db.commit()
    db.refresh(new_match)
    return new_match

@router.post("/{match_id}/start")
def start_match(match_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    match.status = "live"
    db.commit()
    db.refresh(match)
    return match

@router.post("/{match_id}/event", response_model=MatchEventResponse)
def log_event(match_id: int, event: MatchEventCreate,
              db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    new_event = MatchEvent(**event.model_dump())
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@router.delete("/{match_id}/event/undo")
def undo_last_event(match_id: int, db: Session = Depends(get_db),
                    current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    last = db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id
    ).order_by(MatchEvent.id.desc()).first()
    if not last:
        raise HTTPException(status_code=404, detail="No events to undo")
    db.delete(last)
    db.commit()
    return last

@router.post("/{match_id}/end-set")
def end_set(match_id: int, db: Session = Depends(get_db),
            current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    our, their = calculate_score(match_id, match.current_set, db)
    set_score = SetScore(match_id=match_id, set_number=match.current_set,
                         our_score=our, opponent_score=their)
    db.add(set_score)
    match.current_set += 1
    db.commit()
    return {"message": f"Set {match.current_set - 1} ended",
            "our_score": our, "opponent_score": their}

@router.post("/{match_id}/complete")
def complete_match(match_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    our, their = calculate_score(match_id, match.current_set, db)
    set_score = SetScore(match_id=match_id, set_number=match.current_set,
                         our_score=our, opponent_score=their)
    db.add(set_score)
    match.status = "completed"
    db.commit()
    return {"message": "Match completed"}

@router.get("/{match_id}/score")
def get_score(match_id: int, db: Session = Depends(get_db)):
    # public endpoint — no auth required, used by spectators too
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    our, their = calculate_score(match_id, match.current_set, db)
    sets = db.query(SetScore).filter(SetScore.match_id == match_id).all()
    home_team = db.query(Team).filter(Team.id == match.home_team_id).first()
    away_team = db.query(Team).filter(Team.id == match.away_team_id).first()
    our_team = db.query(Team).filter(Team.id == match.our_team_id).first()
    return {
        "current_set": match.current_set,
        "current_set_our": our,
        "current_set_opponent": their,
        "sets": [{"set": s.set_number, "us": s.our_score,
                  "them": s.opponent_score} for s in sets],
        "status": match.status,
        "home_team_name": home_team.name if home_team else "",
        "away_team_name": away_team.name if away_team else "",
        "our_team_name": our_team.name if our_team else "",
    }

@router.get("/{match_id}/events", response_model=List[MatchEventResponse])
def get_events(match_id: int, db: Session = Depends(get_db)):
    return db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id
    ).order_by(MatchEvent.timestamp).all()

from models import Match, MatchEvent, SetScore, Team, Player, MatchLineup
from datetime import datetime

@router.post("/{match_id}/lineup")
def set_lineup(match_id: int, data: dict,
               db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)

    # clear existing lineup
    db.query(MatchLineup).filter(
        MatchLineup.match_id == match_id).delete()

    on_court = data.get("on_court", [])
    bench = data.get("bench", [])

    for pid in on_court:
        db.add(MatchLineup(
            match_id=match_id, player_id=pid,
            is_on_court=True,
            updated_at=datetime.utcnow()
        ))
    for pid in bench:
        db.add(MatchLineup(
            match_id=match_id, player_id=pid,
            is_on_court=False,
            updated_at=datetime.utcnow()
        ))
    db.commit()
    return {"message": "Lineup saved"}

@router.get("/{match_id}/lineup")
def get_lineup(match_id: int, db: Session = Depends(get_db)):
    lineups = db.query(MatchLineup).filter(
        MatchLineup.match_id == match_id).all()
    result = {"on_court": [], "bench": []}
    for l in lineups:
        player = db.query(Player).filter(Player.id == l.player_id).first()
        if not player:
            continue
        entry = {
            "id": player.id,
            "name": player.name,
            "jersey_number": player.jersey_number,
            "position": player.position,
        }
        if l.is_on_court:
            result["on_court"].append(entry)
        else:
            result["bench"].append(entry)
    return result

@router.get("/{match_id}/sets")
def get_sets(match_id: int, db: Session = Depends(get_db)):
    sets = db.query(SetScore).filter(SetScore.match_id == match_id).all()
    return [{"set": s.set_number, "us": s.our_score, "them": s.opponent_score} for s in sets]