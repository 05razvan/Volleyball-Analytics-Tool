from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Player, User, Team
from schemas import PlayerCreate, PlayerResponse
from auth import get_current_user, require_admin
from pydantic import BaseModel

router = APIRouter(prefix="/players", tags=["players"])

class PlayerProfileUpdate(BaseModel):
    jersey_number: Optional[int] = None
    position: Optional[str] = None

@router.get("/", response_model=List[PlayerResponse])
def get_players(team_id: Optional[int] = None,
                db: Session = Depends(get_db)):
    query = db.query(Player)
    if team_id:
        query = query.filter(Player.team_id == team_id)
    return query.all()

@router.get("/{player_id}", response_model=PlayerResponse)
def get_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player

@router.post("/", response_model=PlayerResponse)
def create_player(player: PlayerCreate,
                  db: Session = Depends(get_db),
                  current_user: User = Depends(require_admin)):
    new_player = Player(**player.model_dump())
    db.add(new_player)
    db.commit()
    db.refresh(new_player)
    return new_player

@router.patch("/{player_id}/profile")
def update_player_profile(
    player_id: int,
    body: PlayerProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ("coach", "admin", "captain"):
        raise HTTPException(status_code=403, detail="Not authorised")
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if current_user.role != "admin":
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if not team or team.id != player.team_id:
            raise HTTPException(status_code=403,
                detail="You can only edit players on your own team")
    if body.jersey_number is not None:
        player.jersey_number = body.jersey_number
    if body.position is not None:
        player.position = body.position
    db.commit()
    db.refresh(player)
    return player

@router.delete("/{player_id}")
def delete_player(player_id: int,
                  db: Session = Depends(get_db),
                  current_user: User = Depends(require_admin)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    return {"message": "Player deleted"}

@router.post("/{player_id}/promote-captain")
def promote_captain(player_id: int,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403, detail="Coaches and admins only")
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if current_user.role == "coach":
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if not team or team.id != player.team_id:
            raise HTTPException(status_code=403,
                detail="You can only promote players on your own team")
    # demote existing captain on this team first
    team_players = db.query(Player).filter(
        Player.team_id == player.team_id).all()
    for tp in team_players:
        if tp.user_id and tp.id != player_id:
            existing = db.query(User).filter(
                User.id == tp.user_id,
                User.role == "captain"
            ).first()
            if existing:
                existing.role = "player"
    if not player.user_id:
        raise HTTPException(status_code=400,
            detail="This player has no account to promote")
    user = db.query(User).filter(User.id == player.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = "captain"
    db.commit()
    return {"message": f"{user.name} is now captain"}

@router.post("/{player_id}/remove-from-team")
def remove_from_team(player_id: int,
                     db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403, detail="Not authorised")
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if current_user.role == "coach":
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if not team or team.id != player.team_id:
            raise HTTPException(status_code=403,
                detail="You can only remove players from your own team")
    player.team_id = None
    db.commit()
    return {"message": "Player removed from team"}