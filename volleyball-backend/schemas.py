from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TeamCreate(BaseModel):
    name: str
    division: str

class TeamResponse(BaseModel):
    id: int
    name: str
    division: str
    class Config:
        from_attributes = True

class PlayerCreate(BaseModel):
    name: str
    jersey_number: Optional[int] = None
    position: Optional[str] = None
    team_id: Optional[int] = None
    is_recreational: bool = False

class PlayerResponse(BaseModel):
    id: int
    name: str
    jersey_number: Optional[int]
    position: Optional[str]
    team_id: Optional[int]
    is_recreational: bool
    is_private: bool = False
    class Config:
        from_attributes = True

class MatchCreate(BaseModel):
    home_team_id: int
    away_team_id: int
    our_team_id: int
    date: datetime
    location: Optional[str] = None

class MatchResponse(BaseModel):
    id: int
    home_team_id: int
    away_team_id: int
    our_team_id: int
    date: datetime
    location: Optional[str]
    status: str
    current_set: int
    class Config:
        from_attributes = True

class MatchEventCreate(BaseModel):
    match_id: int
    player_id: Optional[int] = None
    event_type: str
    set_number: int

class MatchEventResponse(BaseModel):
    id: int
    match_id: int
    player_id: Optional[int]
    event_type: str
    set_number: int
    timestamp: datetime
    class Config:
        from_attributes = True

class SetScoreResponse(BaseModel):
    set_number: int
    our_score: int
    opponent_score: int
    class Config:
        from_attributes = True

class AvailabilityCreate(BaseModel):
    player_id: int
    match_id: int
    status: str
    note: Optional[str] = None

class AvailabilityResponse(AvailabilityCreate):
    id: int
    class Config:
        from_attributes = True