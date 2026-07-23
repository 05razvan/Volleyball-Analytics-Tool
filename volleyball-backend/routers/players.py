from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Player
from schemas import PlayerCreate, PlayerResponse
from pydantic import BaseModel as PydanticBase
from auth import get_current_user

router = APIRouter(prefix="/players", tags=["players"])

@router.get("/", response_model=List[PlayerResponse])
def get_players(team_id: Optional[int] = None, db: Session = Depends(get_db)):
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
def create_player(player: PlayerCreate, db: Session = Depends(get_db)):
    new_player = Player(**player.model_dump())
    db.add(new_player)
    db.commit()
    db.refresh(new_player)
    return new_player

class PrivacyUpdate(PydanticBase):
    is_private: bool

@router.patch("/{player_id}/privacy")
def update_privacy(player_id: int, body: PrivacyUpdate,
                   db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your profile")
    player.is_private = body.is_private
    db.commit()
    return {"is_private": player.is_private}