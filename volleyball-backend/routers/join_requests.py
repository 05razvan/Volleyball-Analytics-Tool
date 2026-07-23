from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import TeamJoinRequest, Team, User
from auth import get_current_user, require_coach
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/join-requests", tags=["join-requests"])

class JoinRequestCreate(BaseModel):
    team_id: int

class JoinRequestResponse(BaseModel):
    id: int
    user_id: int
    team_id: int
    status: str
    class Config:
        from_attributes = True

@router.post("/", response_model=JoinRequestResponse)
def request_to_join(req: JoinRequestCreate, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    existing = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.team_id == req.team_id,
        TeamJoinRequest.status == "pending"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Request already pending")
    join_req = TeamJoinRequest(user_id=current_user.id, team_id=req.team_id)
    db.add(join_req)
    db.commit()
    db.refresh(join_req)
    return join_req

@router.get("/pending", response_model=List[JoinRequestResponse])
def get_pending(db: Session = Depends(get_db),
                current_user: User = Depends(require_coach)):
    return db.query(TeamJoinRequest).filter(TeamJoinRequest.status == "pending").all()

@router.post("/{request_id}/approve")
def approve(request_id: int, db: Session = Depends(get_db),
            current_user: User = Depends(require_coach)):
    req = db.query(TeamJoinRequest).filter(TeamJoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "approved"
    user = db.query(User).filter(User.id == req.user_id).first()
    if user and user.player:
        user.player.team_id = req.team_id
    db.commit()
    return {"message": "Approved"}

@router.post("/{request_id}/reject")
def reject(request_id: int, db: Session = Depends(get_db),
           current_user: User = Depends(require_coach)):
    req = db.query(TeamJoinRequest).filter(TeamJoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "rejected"
    db.commit()
    return {"message": "Rejected"}