from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import hash_password, verify_password, create_token
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "player"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int

@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        role=req.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token({"user_id": user.id})
    return {"access_token": token, "token_type": "bearer",
            "role": user.role, "user_id": user.id}

@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_token({"user_id": user.id})
    return {"access_token": token, "token_type": "bearer",
            "role": user.role, "user_id": user.id}

@router.get("/me")
def get_me(db: Session = Depends(get_db),
           current_user: User = Depends(__import__('auth').get_current_user)):
    return {"user_id": current_user.id, "email": current_user.email, "role": current_user.role}