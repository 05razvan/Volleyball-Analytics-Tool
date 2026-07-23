from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models import User, Player, Team
from auth import hash_password, verify_password, create_token, get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = "player"
    team_id: Optional[int] = None  # for coaches joining a team on signup

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    name: str

@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if req.role not in ("player", "coach", "captain"):
        raise HTTPException(status_code=400, detail="Invalid role")

    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        name=req.name,
        role=req.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # if coach, attach to team
    if req.role in ("coach", "captain") and req.team_id:
        team = db.query(Team).filter(Team.id == req.team_id).first()
        if team:
            if not team.head_coach_id:
                team.head_coach_id = user.id
            elif not team.assistant_coach_id:
                team.assistant_coach_id = user.id
            else:
                raise HTTPException(status_code=400,
                    detail="This team already has two coaches")
            db.commit()

    # if player or captain, create player profile
    if req.role in ("player", "captain"):
        player = Player(user_id=user.id, name=req.name)
        db.add(player)
        db.commit()

    token = create_token({"user_id": user.id})
    return {"access_token": token, "token_type": "bearer",
            "role": user.role, "user_id": user.id, "name": user.name}

@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(),
          db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_token({"user_id": user.id})
    return {"access_token": token, "token_type": "bearer",
            "role": user.role, "user_id": user.id, "name": user.name}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    team_id = None
    team_name = None
    if current_user.role in ("coach", "admin"):
        from models import Team
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if team:
            team_id = team.id
            team_name = team.name
    elif current_user.player:
        team_id = current_user.player.team_id
        if team_id:
            from models import Team
            team = db.query(Team).filter(Team.id == team_id).first()
            team_name = team.name if team else None
    return {
        "user_id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "team_id": team_id,
        "team_name": team_name,
    }