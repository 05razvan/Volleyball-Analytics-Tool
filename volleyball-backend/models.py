from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)  # add unique=True
    division = Column(String)
    coach_name = Column(String)
    players = relationship("Player", back_populates="team")

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"))
    name = Column(String, nullable=False)
    jersey_number = Column(Integer)
    position = Column(String)
    is_recreational = Column(Boolean, default=False)
    team = relationship("Team", back_populates="players")

class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True)
    home_team_id = Column(Integer, ForeignKey("teams.id"))
    away_team_id = Column(Integer, ForeignKey("teams.id"))
    date = Column(DateTime)
    location = Column(String)
    home_score = Column(Integer)
    away_score = Column(Integer)

class MatchStats(Base):
    __tablename__ = "match_stats"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"))
    player_id = Column(Integer, ForeignKey("players.id"))
    kills = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    blocks = Column(Integer, default=0)
    aces = Column(Integer, default=0)
    digs = Column(Integer, default=0)
    assists = Column(Integer, default=0)

class Availability(Base):
    __tablename__ = "availability"
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    match_id = Column(Integer, ForeignKey("matches.id"))
    status = Column(String)  # "available", "unavailable", "maybe"
    note = Column(String)