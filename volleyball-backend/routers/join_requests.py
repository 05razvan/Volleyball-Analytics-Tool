from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import TeamJoinRequest, Team, User, Player
from auth import get_current_user, require_coach_or_above
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
    user_name: str
    team_name: str
    class Config:
        from_attributes = True

@router.post("/")
def request_to_join(req: JoinRequestCreate,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    if current_user.role not in ("player", "captain"):
        raise HTTPException(status_code=403, detail="Only players can request to join")

    # block if already on a team
    if current_user.player and current_user.player.team_id:
        raise HTTPException(status_code=400, detail="You are already on a team")

    # block if already approved anywhere
    already_approved = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == "approved"
    ).first()
    if already_approved:
        raise HTTPException(status_code=400,
            detail="You are already a member of a team")

    # block duplicate pending
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
    return {
        "id": join_req.id,
        "user_id": join_req.user_id,
        "team_id": join_req.team_id,
        "status": join_req.status,
        "user_name": current_user.name,
        "team_name": join_req.team.name,
    }

@router.get("/pending")
def get_pending(db: Session = Depends(get_db),
                current_user: User = Depends(require_coach_or_above)):
    # coaches only see requests for their own team
    if current_user.role == "admin":
        requests = db.query(TeamJoinRequest).filter(
            TeamJoinRequest.status == "pending").all()
    else:
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if not team:
            return []
        requests = db.query(TeamJoinRequest).filter(
            TeamJoinRequest.team_id == team.id,
            TeamJoinRequest.status == "pending"
        ).all()

    return [{
        "id": r.id,
        "user_id": r.user_id,
        "team_id": r.team_id,
        "status": r.status,
        "user_name": r.user.name if r.user else "Unknown",
        "team_name": r.team.name if r.team else "Unknown",
    } for r in requests]

@router.post("/{request_id}/approve")
def approve(request_id: int, db: Session = Depends(get_db),
            current_user: User = Depends(require_coach_or_above)):
    req = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # coaches can only approve for their own team
    if current_user.role != "admin":
        team = db.query(Team).filter(
            (Team.head_coach_id == current_user.id) |
            (Team.assistant_coach_id == current_user.id)
        ).first()
        if not team or team.id != req.team_id:
            raise HTTPException(status_code=403,
                detail="You can only approve requests for your own team")

    req.status = "approved"
    user = db.query(User).filter(User.id == req.user_id).first()
    if user and user.player:
        user.player.team_id = req.team_id
    db.commit()

    # reject all other pending requests from this user
    db.query(TeamJoinRequest).filter(
        TeamJoinRequest.user_id == req.user_id,
        TeamJoinRequest.status == "pending"
    ).update({"status": "rejected"})
    db.commit()
    return {"message": "Approved"}

@router.post("/{request_id}/reject")
def reject(request_id: int, db: Session = Depends(get_db),
           current_user: User = Depends(require_coach_or_above)):
    req = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "rejected"
    db.commit()
    return {"message": "Rejected"}

@router.post("/leave")
def leave_team(db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    if not current_user.player or not current_user.player.team_id:
        raise HTTPException(status_code=400, detail="You are not on a team")
    current_user.player.team_id = None
    db.query(TeamJoinRequest).filter(
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == "approved"
    ).update({"status": "left"})
    db.commit()
    return {"message": "Left team"}