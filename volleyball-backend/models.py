from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

DIVISIONS = [
    "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
    "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
]

POSITIONS = ["Setter", "Outside Hitter", "Opposite", "Middle Blocker", "Libero"]

EVENT_TYPES = ["kill", "spike", "dig", "block", "ace", "serve_error", "assist", "opponent_point"]
class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    division = Column(String, nullable=False)
    coach_name = Column(String)
    players = relationship("Player", back_populates="team")

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    name = Column(String, nullable=False)
    jersey_number = Column(Integer, nullable=True)
    position = Column(String, nullable=True)
    is_recreational = Column(Boolean, default=False)
    team = relationship("Team", back_populates="players")
    user = relationship("User", back_populates="player")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="player")  # "player" or "coach"
    created_at = Column(DateTime, default=datetime.utcnow)
    player = relationship("Player", back_populates="user", uselist=False)

class TeamJoinRequest(Base):
    __tablename__ = "team_join_requests"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    team_id = Column(Integer, ForeignKey("teams.id"))
    status = Column(String, default="pending")  # "pending", "approved", "rejected"
    created_at = Column(DateTime, default=datetime.utcnow)

class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True)
    home_team_id = Column(Integer, ForeignKey("teams.id"))
    away_team_id = Column(Integer, ForeignKey("teams.id"))
    date = Column(DateTime)
    location = Column(String)
    status = Column(String, default="scheduled")  # "scheduled", "live", "completed"
    our_team_id = Column(Integer, ForeignKey("teams.id"))
    current_set = Column(Integer, default=1)
    events = relationship("MatchEvent", back_populates="match")
    sets = relationship("SetScore", back_populates="match")

class SetScore(Base):
    __tablename__ = "set_scores"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"))
    set_number = Column(Integer)
    our_score = Column(Integer, default=0)
    opponent_score = Column(Integer, default=0)
    match = relationship("Match", back_populates="sets")

class MatchEvent(Base):
    __tablename__ = "match_events"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"))
    player_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    event_type = Column(String, nullable=False)
    set_number = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    match = relationship("Match", back_populates="events")

class Availability(Base):
    __tablename__ = "availability"
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    match_id = Column(Integer, ForeignKey("matches.id"))
    status = Column(String)
    note = Column(String, nullable=True)