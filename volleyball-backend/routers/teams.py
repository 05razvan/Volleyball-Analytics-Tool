from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Team, Player, User
from schemas import TeamCreate, TeamResponse
from auth import get_current_user, require_admin, get_optional_user
from typing import List, Optional

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

@router.get("/{team_id}/players")
def get_team_players(team_id: int, db: Session = Depends(get_db),
                     current_user=Depends(get_optional_user)):
    players = db.query(Player).filter(Player.team_id == team_id).all()
    result = []
    for p in players:
        # respect privacy — only show private players to teammates/coaches
        if p.is_private:
            if not current_user:
                continue
            if current_user.role not in ("coach", "admin", "captain"):
                if not current_user.player or current_user.player.team_id != team_id:
                    continue
        result.append({
            "id": p.id,
            "name": p.name,
            "jersey_number": p.jersey_number,
            "position": p.position,
            "is_recreational": p.is_recreational,
            "is_private": p.is_private,
            "team_id": p.team_id,
        })
    return result

@router.get("/{team_id}")
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    head_coach = db.query(User).filter(User.id == team.head_coach_id).first()
    assistant_coach = db.query(User).filter(
        User.id == team.assistant_coach_id).first()
    return {
        "id": team.id,
        "name": team.name,
        "division": team.division,
        "head_coach": head_coach.name if head_coach else None,
        "assistant_coach": assistant_coach.name if assistant_coach else None,
    }