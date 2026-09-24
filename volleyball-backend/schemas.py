from pydantic import BaseModel, Field
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
    is_captain: bool = False

class PlayerResponse(BaseModel):
    id: int
    name: str
    jersey_number: Optional[int]
    position: Optional[str]
    team_id: Optional[int]
    is_recreational: bool
    is_private: bool = False
    is_captain: bool = False
    class Config:
        from_attributes = True

class MatchCreate(BaseModel):
    home_team_id: int
    away_team_id: int
    our_team_id: int
    date: datetime
    location: Optional[str] = None
    match_type: str

class MatchResponse(BaseModel):
    id: int
    home_team_id: int
    away_team_id: int
    our_team_id: int
    date: datetime
    location: Optional[str]
    match_type: str
    status: str
    current_set: int
    class Config:
        from_attributes = True

class MatchEventCreate(BaseModel):
    match_id: int
    player_id: Optional[int] = None
    event_type: str
    set_number: int
    rotation_number: int = 1
    we_are_serving: bool = False
    pass_rating: Optional[int] = None
    assist_player_id: Optional[int] = None
    state_before: Optional[dict] = None

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

class MatchLineupUpdate(BaseModel):
    on_court: List[int]
    bench: List[int] = Field(default_factory=list)

class MatchTrackerStateUpdate(BaseModel):
    positions: List[int]
    bench: List[int] = Field(default_factory=list)
    we_are_serving: bool
    rotation_number: int
    passing_enabled: bool = False
    errors_enabled: bool = False
    active_libero_swap: Optional[dict] = None

class MatchSubstitutionCreate(BaseModel):
    player_out_id: int
    player_in_id: int
    set_number: int
    rotation_number: int

class SpectatorHeartbeat(BaseModel):
    session_id: str = Field(min_length=8, max_length=128)

class AvailabilityCreate(BaseModel):
    player_id: int
    match_id: int
    status: str
    note: Optional[str] = None

class AvailabilityResponse(AvailabilityCreate):
    id: int
    class Config:
        from_attributes = True
