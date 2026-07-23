from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TeamCreate(BaseModel):
    name: str
    division: str
    coach_name: str

class TeamResponse(BaseModel):
    id: int
    name: str
    division: str
    coach_name: str

    class Config:
        from_attributes = True

class PlayerCreate(BaseModel):
    name: str
    jersey_number: int
    position: str
    team_id: int
    is_recreational: bool = False

class PlayerResponse(BaseModel):
    id: int
    name: str
    jersey_number: int
    position: str
    team_id: int
    is_recreational: bool

    class Config:
        from_attributes = True

class MatchCreate(BaseModel):
    home_team_id: int
    away_team_id: int
    date: datetime
    location: str

class MatchResponse(BaseModel):
    id: int
    home_team_id: int
    away_team_id: int
    date: datetime
    location: str
    home_score: Optional[int]
    away_score: Optional[int]

    class Config:
        from_attributes = True

class MatchStatsCreate(BaseModel):
    match_id: int
    player_id: int
    kills: int = 0
    errors: int = 0
    blocks: int = 0
    aces: int = 0
    digs: int = 0
    assists: int = 0

class MatchStatsResponse(MatchStatsCreate):
    id: int

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