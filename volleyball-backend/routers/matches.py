from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Availability,
    EVENT_TYPES,
    MATCH_TYPES,
    Match,
    MatchEvent,
    MatchEventContext,
    MatchLineup,
    MatchSubstitution,
    MatchTrackerState,
    Player,
    SetScore,
    SetParticipation,
    SpectatorSession,
    Team,
)
from schemas import (
    MatchCreate,
    MatchEventCreate,
    MatchEventResponse,
    MatchLineupUpdate,
    MatchResponse,
    MatchSubstitutionCreate,
    MatchTrackerStateUpdate,
    SpectatorHeartbeat,
)
from auth import get_current_user, require_coach_or_above, get_optional_user
from typing import List
from datetime import datetime, timedelta
import json

router = APIRouter(prefix="/matches", tags=["matches"])

POINTS_FOR_US = {"kill", "ace", "our_point", "kill_block", "setter_dump"}
POINTS_FOR_THEM = {
    "serve_error", "opponent_point", "foot_fault", "net_touch", "spike_error",
}

def team_gender(team: Team):
    if team.division.startswith("Men's"):
        return "men"
    if team.division.startswith("Women's"):
        return "women"
    return None

def calculate_score(match_id: int, set_number: int, db: Session):
    events = db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id,
        MatchEvent.set_number == set_number
    ).all()
    our = (sum(1 for e in events if e.event_type in POINTS_FOR_US)
           - sum(1 for e in events if e.event_type == "score_correction_us"))
    their = (sum(1 for e in events if e.event_type in POINTS_FOR_THEM)
             - sum(1 for e in events if e.event_type == "score_correction_them"))
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
    if home.id == away.id:
        raise HTTPException(status_code=400,
            detail="Home and away teams must be different")
    if match.our_team_id not in {home.id, away.id}:
        raise HTTPException(status_code=400,
            detail="The tracking team must be playing in the match")
    if match.match_type not in MATCH_TYPES:
        raise HTTPException(status_code=400,
            detail="Match type must be league, cup, or friendly")
    if not team_gender(home) or team_gender(home) != team_gender(away):
        raise HTTPException(status_code=400,
            detail="Men's and women's teams cannot play each other")
    if match.match_type == "league" and home.division != away.division:
        raise HTTPException(status_code=400,
            detail="League opponents must be in the same division")
    new_match = Match(**match.model_dump())
    db.add(new_match)
    db.commit()
    db.refresh(new_match)
    return new_match

@router.delete("/{match_id}")
def delete_match(match_id: int, db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403,
            detail="Only coaches and admins can delete matches")
    if current_user.role == "coach":
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if not team or team.id != match.our_team_id:
            raise HTTPException(status_code=403,
                detail="You can only delete matches for your own team")

    event_ids = [event_id for (event_id,) in db.query(MatchEvent.id).filter(
        MatchEvent.match_id == match_id).all()]
    if event_ids:
        db.query(MatchEventContext).filter(
            MatchEventContext.event_id.in_(event_ids)).delete(
                synchronize_session=False)
    db.query(MatchSubstitution).filter(
        MatchSubstitution.match_id == match_id).delete(synchronize_session=False)
    db.query(SpectatorSession).filter(
        SpectatorSession.match_id == match_id).delete(synchronize_session=False)
    db.query(MatchTrackerState).filter(
        MatchTrackerState.match_id == match_id).delete(synchronize_session=False)
    db.query(MatchLineup).filter(
        MatchLineup.match_id == match_id).delete(synchronize_session=False)
    db.query(SetParticipation).filter(
        SetParticipation.match_id == match_id).delete(synchronize_session=False)
    db.query(Availability).filter(
        Availability.match_id == match_id).delete(synchronize_session=False)
    db.query(SetScore).filter(
        SetScore.match_id == match_id).delete(synchronize_session=False)
    db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id).delete(synchronize_session=False)
    db.delete(match)
    db.commit()
    return {"message": "Match and its tracking data deleted"}

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
    if match.status != "live":
        raise HTTPException(status_code=400, detail="Events can only be logged for a live match")
    if event.match_id != match_id:
        raise HTTPException(status_code=400, detail="Match ID does not match the request path")
    if event.set_number != match.current_set:
        raise HTTPException(status_code=400, detail="Event set does not match the current set")
    if event.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid event type")
    if event.rotation_number not in range(1, 7):
        raise HTTPException(status_code=400, detail="Rotation must be between 1 and 6")
    if event.pass_rating is not None and (
        event.event_type != "pass" or event.pass_rating not in range(0, 4)
    ):
        raise HTTPException(status_code=400, detail="Pass rating must be 0, 1, 2, or 3")
    if event.event_type == "pass" and event.pass_rating is None:
        raise HTTPException(status_code=400, detail="Pass events require a rating")
    if event.assist_player_id is not None:
        if event.event_type not in {"kill", "setter_dump"}:
            raise HTTPException(status_code=400,
                detail="Assists can only be attached to a kill")
        if event.assist_player_id == event.player_id:
            raise HTTPException(status_code=400,
                detail="A player cannot assist their own kill")
        assister = db.query(Player).filter(
            Player.id == event.assist_player_id,
            Player.team_id == match.our_team_id,
        ).first()
        if not assister:
            raise HTTPException(status_code=400,
                detail="Assist player does not belong to the tracking team")
    if event.event_type == "score_correction_us":
        our, _ = calculate_score(match_id, match.current_set, db)
        if our <= 0:
            raise HTTPException(status_code=400, detail="Our score is already zero")
    if event.event_type == "score_correction_them":
        _, their = calculate_score(match_id, match.current_set, db)
        if their <= 0:
            raise HTTPException(status_code=400, detail="Opponent score is already zero")
    if event.player_id is not None:
        player = db.query(Player).filter(Player.id == event.player_id).first()
        if not player or player.team_id != match.our_team_id:
            raise HTTPException(status_code=400,
                detail="Event player does not belong to the tracking team")

    new_event = MatchEvent(
        match_id=event.match_id,
        player_id=event.player_id,
        event_type=event.event_type,
        set_number=event.set_number,
    )
    db.add(new_event)
    db.flush()
    db.add(MatchEventContext(
        event_id=new_event.id,
        rotation_number=event.rotation_number,
        we_were_serving=event.we_are_serving,
        pass_rating=event.pass_rating,
        assist_player_id=event.assist_player_id,
        state_before_json=json.dumps(event.state_before) if event.state_before else None,
    ))
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
    context = db.query(MatchEventContext).filter(
        MatchEventContext.event_id == last.id).first()
    restored_state = json.loads(context.state_before_json) \
        if context and context.state_before_json else None
    if restored_state:
        state = db.query(MatchTrackerState).filter_by(match_id=match_id).first()
        if not state:
            state = MatchTrackerState(match_id=match_id)
            db.add(state)
        state.positions_json = json.dumps(restored_state["positions"])
        state.bench_json = json.dumps(restored_state["bench"])
        state.we_are_serving = restored_state["we_are_serving"]
        state.rotation_number = restored_state["rotation_number"]
        state.passing_enabled = restored_state.get("passing_enabled", False)
        state.errors_enabled = restored_state.get("errors_enabled", False)
        state.active_libero_swap_json = json.dumps(
            restored_state.get("active_libero_swap")
        ) if restored_state.get("active_libero_swap") else None
    if context:
        db.delete(context)
    db.delete(last)
    db.commit()
    return {"event": {
        "id": last.id,
        "event_type": last.event_type,
        "player_id": last.player_id,
    }, "restored_state": restored_state}

@router.post("/{match_id}/end-set")
def end_set(match_id: int, db: Session = Depends(get_db),
            current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    if match.status != "live":
        raise HTTPException(status_code=400, detail="Only a live match can end a set")
    if db.query(SetScore).filter_by(
        match_id=match_id, set_number=match.current_set).first():
        raise HTTPException(status_code=409, detail="This set has already been recorded")
    our, their = calculate_score(match_id, match.current_set, db)
    set_score = SetScore(match_id=match_id, set_number=match.current_set,
                         our_score=our, opponent_score=their)
    db.add(set_score)
    match.current_set += 1
    db.query(MatchLineup).filter(
        MatchLineup.match_id == match_id).delete(synchronize_session=False)
    db.query(MatchTrackerState).filter(
        MatchTrackerState.match_id == match_id).delete(synchronize_session=False)
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
    if match.status != "live":
        raise HTTPException(status_code=400, detail="Only a live match can be completed")
    if db.query(SetScore).filter_by(
        match_id=match_id, set_number=match.current_set).first():
        raise HTTPException(status_code=409, detail="This set has already been recorded")
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

@router.post("/{match_id}/lineup")
def set_lineup(match_id: int, data: MatchLineupUpdate,
               db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)

    if len(data.on_court) != 6:
        raise HTTPException(status_code=400,
            detail="A lineup must contain exactly 6 on-court players")

    player_ids = data.on_court + data.bench
    if len(player_ids) != len(set(player_ids)):
        raise HTTPException(status_code=400,
            detail="A player cannot appear more than once in a lineup")

    valid_ids = {
        player.id for player in db.query(Player).filter(
            Player.id.in_(player_ids),
            Player.team_id == match.our_team_id,
        ).all()
    }
    invalid_ids = sorted(set(player_ids) - valid_ids)
    if invalid_ids:
        raise HTTPException(status_code=400,
            detail=f"Players do not belong to the tracking team: {invalid_ids}")

    front_row_ids = data.on_court[1:4]
    front_row_libero = db.query(Player).filter(
        Player.id.in_(front_row_ids), Player.position == "Libero").first()
    if front_row_libero:
        raise HTTPException(status_code=400,
            detail="A libero cannot be placed in a front-row position")

    # clear existing lineup
    db.query(MatchLineup).filter(
        MatchLineup.match_id == match_id).delete()

    for pid in data.on_court:
        db.add(MatchLineup(
            match_id=match_id, player_id=pid,
            is_on_court=True,
            updated_at=datetime.utcnow()
        ))
    for pid in data.bench:
        db.add(MatchLineup(
            match_id=match_id, player_id=pid,
            is_on_court=False,
            updated_at=datetime.utcnow()
        ))
    for pid in data.on_court:
        exists = db.query(SetParticipation.id).filter_by(
            match_id=match_id,
            set_number=match.current_set,
            player_id=pid,
        ).first()
        if not exists:
            db.add(SetParticipation(
                match_id=match_id,
                set_number=match.current_set,
                player_id=pid,
            ))
    db.commit()
    return {"message": "Lineup saved"}

@router.put("/{match_id}/tracker-state")
def save_tracker_state(match_id: int, data: MatchTrackerStateUpdate,
                       db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    if len(data.positions) != 6 or len(set(data.positions)) != 6:
        raise HTTPException(status_code=400,
            detail="Tracker state requires six unique court positions")
    if data.rotation_number not in range(1, 7):
        raise HTTPException(status_code=400, detail="Rotation must be between 1 and 6")
    front_row_libero = db.query(Player).filter(
        Player.id.in_(data.positions[1:4]),
        Player.position == "Libero",
    ).first()
    if front_row_libero:
        raise HTTPException(status_code=400,
            detail="A libero cannot be placed in a front-row position")
    all_ids = data.positions + data.bench
    valid_count = db.query(Player).filter(
        Player.id.in_(all_ids), Player.team_id == match.our_team_id).count()
    if valid_count != len(set(all_ids)) or len(all_ids) != len(set(all_ids)):
        raise HTTPException(status_code=400, detail="Tracker state contains invalid players")

    state = db.query(MatchTrackerState).filter_by(match_id=match_id).first()
    if not state:
        state = MatchTrackerState(match_id=match_id)
        db.add(state)
    state.positions_json = json.dumps(data.positions)
    state.bench_json = json.dumps(data.bench)
    state.we_are_serving = data.we_are_serving
    state.rotation_number = data.rotation_number
    state.passing_enabled = data.passing_enabled
    state.errors_enabled = data.errors_enabled
    state.active_libero_swap_json = json.dumps(data.active_libero_swap) \
        if data.active_libero_swap else None
    db.commit()
    return {"message": "Tracker state saved"}

@router.get("/{match_id}/tracker-state")
def get_tracker_state(match_id: int, db: Session = Depends(get_db)):
    state = db.query(MatchTrackerState).filter_by(match_id=match_id).first()
    if not state:
        return None
    return {
        "positions": json.loads(state.positions_json),
        "bench": json.loads(state.bench_json),
        "we_are_serving": state.we_are_serving,
        "rotation_number": state.rotation_number,
        "passing_enabled": state.passing_enabled,
        "errors_enabled": state.errors_enabled,
        "active_libero_swap": json.loads(state.active_libero_swap_json)
            if state.active_libero_swap_json else None,
        "updated_at": state.updated_at,
    }

@router.post("/{match_id}/substitutions")
def log_substitution(match_id: int, data: MatchSubstitutionCreate,
                     db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    check_match_permission(match, current_user, db)
    if match.status != "live" or data.set_number != match.current_set:
        raise HTTPException(status_code=400, detail="Invalid substitution match state")
    players = db.query(Player).filter(
        Player.id.in_([data.player_out_id, data.player_in_id]),
        Player.team_id == match.our_team_id,
    ).count()
    if players != 2 or data.player_out_id == data.player_in_id:
        raise HTTPException(status_code=400, detail="Invalid substitution players")
    sequence = db.query(MatchSubstitution).filter_by(match_id=match_id).count() + 1
    substitution = MatchSubstitution(
        match_id=match_id,
        set_number=data.set_number,
        sequence=sequence,
        player_out_id=data.player_out_id,
        player_in_id=data.player_in_id,
        rotation_number=data.rotation_number,
    )
    for player_id in (data.player_out_id, data.player_in_id):
        exists = db.query(SetParticipation.id).filter_by(
            match_id=match_id,
            set_number=data.set_number,
            player_id=player_id,
        ).first()
        if not exists:
            db.add(SetParticipation(
                match_id=match_id,
                set_number=data.set_number,
                player_id=player_id,
            ))
    db.add(substitution)
    db.commit()
    return {"message": "Substitution recorded", "sequence": sequence}

@router.get("/{match_id}/substitutions")
def get_substitutions(match_id: int, db: Session = Depends(get_db)):
    substitutions = db.query(MatchSubstitution).filter_by(
        match_id=match_id).order_by(MatchSubstitution.sequence).all()
    players = {p.id: p.name for p in db.query(Player).filter(Player.id.in_({
        player_id for sub in substitutions
        for player_id in (sub.player_out_id, sub.player_in_id)
    })).all()} if substitutions else {}
    return [{
        "id": sub.id,
        "set_number": sub.set_number,
        "sequence": sub.sequence,
        "player_out_id": sub.player_out_id,
        "player_out_name": players.get(sub.player_out_id, "Unknown"),
        "player_in_id": sub.player_in_id,
        "player_in_name": players.get(sub.player_in_id, "Unknown"),
        "rotation_number": sub.rotation_number,
        "timestamp": sub.timestamp,
    } for sub in substitutions]

@router.get("/{match_id}/spectator")
def get_spectator_snapshot(match_id: int, db: Session = Depends(get_db)):
    """Return the full public scoreboard in one request for efficient polling."""
    score = get_score(match_id, db)
    lineup = get_lineup(match_id, db)
    tracker = get_tracker_state(match_id, db)
    events = db.query(MatchEvent).filter_by(match_id=match_id).order_by(
        MatchEvent.timestamp.desc()).limit(100).all()
    event_contexts = {context.event_id: context for context in
        db.query(MatchEventContext).filter(MatchEventContext.event_id.in_(
            [event.id for event in events])).all()} if events else {}
    player_ids = {event.player_id for event in events if event.player_id}
    player_ids.update(
        context.assist_player_id for context in event_contexts.values()
        if context.assist_player_id
    )
    player_names = {player.id: player.name for player in db.query(Player).filter(
        Player.id.in_(player_ids)).all()} if player_ids else {}
    return {
        "score": score,
        "lineup": lineup,
        "tracker": tracker,
        "substitutions": get_substitutions(match_id, db),
        "events": [{
            "id": event.id,
            "player_id": event.player_id,
            "player_name": player_names.get(event.player_id),
            "event_type": event.event_type,
            "pass_rating": event_contexts[event.id].pass_rating
                if event.id in event_contexts else None,
            "assist_player_id": event_contexts[event.id].assist_player_id
                if event.id in event_contexts else None,
            "assist_player_name": player_names.get(
                event_contexts[event.id].assist_player_id)
                if event.id in event_contexts and
                event_contexts[event.id].assist_player_id else None,
            "set_number": event.set_number,
            "timestamp": event.timestamp,
        } for event in events],
    }

@router.post("/{match_id}/spectators/heartbeat")
def spectator_heartbeat(match_id: int, data: SpectatorHeartbeat,
                        db: Session = Depends(get_db)):
    """Register an anonymous active viewer and return the live viewer count."""
    if not db.query(Match.id).filter(Match.id == match_id).first():
        raise HTTPException(status_code=404, detail="Match not found")

    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=30)
    db.query(SpectatorSession).filter(
        SpectatorSession.last_seen < cutoff).delete(synchronize_session=False)

    session = db.query(SpectatorSession).filter_by(
        match_id=match_id, session_id=data.session_id).first()
    if session:
        session.last_seen = now
    else:
        db.add(SpectatorSession(
            match_id=match_id,
            session_id=data.session_id,
            last_seen=now,
        ))
    db.flush()

    count = db.query(SpectatorSession).filter(
        SpectatorSession.match_id == match_id,
        SpectatorSession.last_seen >= cutoff,
    ).count()
    db.commit()
    return {"spectators": count}

@router.get("/{match_id}/lineup")
def get_lineup(match_id: int, db: Session = Depends(get_db)):
    lineups = db.query(MatchLineup).filter(
        MatchLineup.match_id == match_id).order_by(MatchLineup.id).all()
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

@router.get("/team/{team_id}/history")
def team_match_history(team_id: int, db: Session = Depends(get_db)):
    matches = db.query(Match).filter(
        (Match.our_team_id == team_id),
        Match.status == 'completed'
    ).order_by(Match.date.desc()).all()

    history = []
    for match in matches:
        sets = db.query(SetScore).filter(SetScore.match_id == match.id).all()
        our_sets = sum(1 for s in sets if s.our_score > s.opponent_score)
        their_sets = sum(1 for s in sets if s.opponent_score > s.our_score)
        
        # figure out opponent name
        if match.our_team_id == match.home_team_id:
            opp = db.query(Team).filter(Team.id == match.away_team_id).first()
        else:
            opp = db.query(Team).filter(Team.id == match.home_team_id).first()

        history.append({
            "match_id": match.id,
            "date": match.date.strftime("%d %b %Y") if match.date else "",
            "opponent": opp.name if opp else "Unknown",
            "location": match.location or "",
            "our_sets": our_sets,
            "their_sets": their_sets,
            "result": "W" if our_sets > their_sets else "L",
            "sets": [{"set": s.set_number, "us": s.our_score, "them": s.opponent_score} for s in sorted(sets, key=lambda x: x.set_number)],
        })

    return history
