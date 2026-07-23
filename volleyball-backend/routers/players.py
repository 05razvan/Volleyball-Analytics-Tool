from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Player
from schemas import PlayerCreate, PlayerResponse
from typing import List

router = APIRouter(prefix="/players", tags=["players"])

@router.get("/", response_model=List[PlayerResponse])
def get_players(db: Session = Depends(get_db)):
    return db.query(Player).all()

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