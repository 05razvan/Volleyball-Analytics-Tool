from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Availability, Match, MatchEvent, MatchEventContext, MatchLineup,
    MatchSubstitution, MatchTrackerState, Player, SetScore, SpectatorSession, Team,
    TeamJoinRequest, User,
)
from schemas import TeamCreate, TeamResponse
from auth import require_admin, get_optional_user
from typing import List

router = APIRouter(prefix="/teams", tags=["teams"])

@router.get("/", response_model=List[TeamResponse])
def get_teams(db: Session = Depends(get_db)):
    return db.query(Team).all()

@router.post("/", response_model=TeamResponse)
def create_team(team: TeamCreate,
                db: Session = Depends(get_db),
                current_user: User = Depends(require_admin)):
    existing = db.query(Team).filter(Team.name == team.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Team name already exists")
    new_team = Team(**team.model_dump())
    db.add(new_team)
    db.commit()
    db.refresh(new_team)
    return new_team

@router.delete("/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(require_admin)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    match_ids = [match_id for (match_id,) in db.query(Match.id).filter(
        (Match.home_team_id == team_id) |
        (Match.away_team_id == team_id) |
        (Match.our_team_id == team_id)
    ).all()]
    player_ids = [player_id for (player_id,) in db.query(Player.id).filter(
        Player.team_id == team_id).all()]

    event_query = db.query(MatchEvent.id)
    if match_ids:
        event_query = event_query.filter(MatchEvent.match_id.in_(match_ids))
        event_ids = [event_id for (event_id,) in event_query.all()]
        if event_ids:
            db.query(MatchEventContext).filter(
                MatchEventContext.event_id.in_(event_ids)).delete(
                    synchronize_session=False)
        for model in (
            MatchSubstitution, MatchTrackerState, MatchLineup,
            Availability, SetScore, SpectatorSession, MatchEvent,
        ):
            db.query(model).filter(model.match_id.in_(match_ids)).delete(
                synchronize_session=False)
        db.query(Match).filter(Match.id.in_(match_ids)).delete(
            synchronize_session=False)

    if player_ids:
        remaining_event_ids = [event_id for (event_id,) in
            db.query(MatchEvent.id).filter(
                MatchEvent.player_id.in_(player_ids)).all()]
        if remaining_event_ids:
            db.query(MatchEventContext).filter(
                MatchEventContext.event_id.in_(remaining_event_ids)).delete(
                    synchronize_session=False)
        db.query(MatchSubstitution).filter(
            (MatchSubstitution.player_out_id.in_(player_ids)) |
            (MatchSubstitution.player_in_id.in_(player_ids))
        ).delete(synchronize_session=False)
        db.query(Availability).filter(
            Availability.player_id.in_(player_ids)).delete(synchronize_session=False)
        db.query(MatchLineup).filter(
            MatchLineup.player_id.in_(player_ids)).delete(synchronize_session=False)
        db.query(MatchEvent).filter(
            MatchEvent.player_id.in_(player_ids)).delete(synchronize_session=False)
        db.query(Player).filter(Player.id.in_(player_ids)).delete(
            synchronize_session=False)

    db.query(TeamJoinRequest).filter(
        TeamJoinRequest.team_id == team_id).delete(synchronize_session=False)
    db.delete(team)
    db.commit()
    return {"message": "Team, roster, and match history deleted"}

@router.get("/{team_id}")
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    head_coach = db.query(User).filter(
        User.id == team.head_coach_id).first()
    assistant_coach = db.query(User).filter(
        User.id == team.assistant_coach_id).first()
    return {
        "id": team.id,
        "name": team.name,
        "division": team.division,
        "head_coach": head_coach.name if head_coach else None,
        "assistant_coach": assistant_coach.name if assistant_coach else None,
    }

@router.get("/{team_id}/players")
def get_team_players(team_id: int,
                     db: Session = Depends(get_db),
                     current_user=Depends(get_optional_user)):
    players = db.query(Player).filter(Player.team_id == team_id).all()
    result = []
    for p in players:
        user_role = None
        if p.user_id:
            user = db.query(User).filter(User.id == p.user_id).first()
            if user:
                user_role = user.role
        result.append({
            "id": p.id,
            "name": p.name,
            "jersey_number": p.jersey_number,
            "position": p.position,
            "is_recreational": p.is_recreational,
            "is_private": p.is_private,
            "is_captain": p.is_captain,
            "team_id": p.team_id,
            "user_id": p.user_id,
            "user_role": user_role,
        })
    result.sort(key=lambda x: (
        0 if x["is_captain"] else 1, x["name"]
    ))
    return result
