from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import MatchEvent, Player, Match, SetScore, Team
from typing import List, Optional

router = APIRouter(prefix="/analytics", tags=["analytics"])

def get_player_stats(player_id: int, db: Session, match_id: Optional[int] = None):
    query = db.query(MatchEvent).filter(MatchEvent.player_id == player_id)
    if match_id:
        query = query.filter(MatchEvent.match_id == match_id)
    events = query.all()

    kills = sum(1 for e in events if e.event_type == "kill")
    errors = sum(1 for e in events if e.event_type == "error")
    aces = sum(1 for e in events if e.event_type == "ace")
    serve_errors = sum(1 for e in events if e.event_type == "serve_error")
    blocks = sum(1 for e in events if e.event_type == "block")
    digs = sum(1 for e in events if e.event_type == "dig")
    assists = sum(1 for e in events if e.event_type == "assist")

    total_attacks = kills + errors
    kill_pct = round((kills / total_attacks) * 100, 1) if total_attacks > 0 else 0

    total_serves = aces + serve_errors
    serve_pct = round((aces / total_serves) * 100, 1) if total_serves > 0 else 0

    attack_efficiency = round(((kills - errors) / total_attacks) * 100, 1) if total_attacks > 0 else 0

    return {
        "player_id": player_id,
        "kills": kills,
        "errors": errors,
        "aces": aces,
        "serve_errors": serve_errors,
        "blocks": blocks,
        "digs": digs,
        "assists": assists,
        "kill_pct": kill_pct,
        "serve_pct": serve_pct,
        "attack_efficiency": attack_efficiency,
        "total_attacks": total_attacks,
        "total_serves": total_serves,
    }

@router.get("/player/{player_id}")
def player_analytics(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    stats = get_player_stats(player_id, db)
    stats["name"] = player.name if player else "Unknown"
    stats["position"] = player.position if player else None
    return stats

@router.get("/team/{team_id}")
def team_analytics(team_id: int, db: Session = Depends(get_db)):
    players = db.query(Player).filter(Player.team_id == team_id).all()
    player_stats = [get_player_stats(p.id, db) for p in players]

    for i, p in enumerate(players):
        player_stats[i]["name"] = p.name
        player_stats[i]["position"] = p.position

    total_kills = sum(s["kills"] for s in player_stats)
    total_errors = sum(s["errors"] for s in player_stats)
    total_attacks = sum(s["total_attacks"] for s in player_stats)
    total_aces = sum(s["aces"] for s in player_stats)
    total_serve_errors = sum(s["serve_errors"] for s in player_stats)
    total_serves = sum(s["total_serves"] for s in player_stats)

    return {
        "team_id": team_id,
        "players": player_stats,
        "team_kill_pct": round((total_kills / total_attacks) * 100, 1) if total_attacks > 0 else 0,
        "team_attack_efficiency": round(((total_kills - total_errors) / total_attacks) * 100, 1) if total_attacks > 0 else 0,
        "team_serve_pct": round((total_aces / total_serves) * 100, 1) if total_serves > 0 else 0,
        "team_serve_error_rate": round((total_serve_errors / total_serves) * 100, 1) if total_serves > 0 else 0,
    }

@router.get("/team/{team_id}/trend")
def team_trend(team_id: int, db: Session = Depends(get_db)):
    matches = db.query(Match).filter(
        (Match.home_team_id == team_id) | (Match.away_team_id == team_id),
        Match.status == "completed"
    ).order_by(Match.date.desc()).limit(5).all()

    trend = []
    for match in reversed(matches):
        events = db.query(MatchEvent).filter(MatchEvent.match_id == match.id).all()
        player_ids = [p.id for p in db.query(Player).filter(Player.team_id == team_id).all()]
        our_events = [e for e in events if e.player_id in player_ids]

        kills = sum(1 for e in our_events if e.event_type == "kill")
        errors = sum(1 for e in our_events if e.event_type == "error")
        aces = sum(1 for e in our_events if e.event_type == "ace")
        serve_errors = sum(1 for e in our_events if e.event_type == "serve_error")
        total_attacks = kills + errors
        total_serves = aces + serve_errors

        sets = db.query(SetScore).filter(SetScore.match_id == match.id).all()
        sets_won = sum(1 for s in sets if s.our_score > s.opponent_score)
        sets_lost = sum(1 for s in sets if s.opponent_score > s.our_score)

        opponent_id = match.away_team_id if match.home_team_id == team_id else match.home_team_id
        opponent = db.query(Team).filter(Team.id == opponent_id).first()

        trend.append({
            "match_id": match.id,
            "date": match.date.strftime("%d %b"),
            "opponent": opponent.name if opponent else "Unknown",
            "result": f"{sets_won}–{sets_lost}",
            "attack_efficiency": round(((kills - errors) / total_attacks) * 100, 1) if total_attacks > 0 else 0,
            "serve_error_rate": round((serve_errors / total_serves) * 100, 1) if total_serves > 0 else 0,
            "kill_pct": round((kills / total_attacks) * 100, 1) if total_attacks > 0 else 0,
        })

    return trend