from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import MatchEvent, MatchEventContext, Player, Match, SetScore, Team
from typing import Optional

router = APIRouter(prefix="/analytics", tags=["analytics"])

def get_player_stats(player_id: int, db: Session,
                     match_id: Optional[int] = None,
                     last_n: Optional[int] = None):
    query = db.query(MatchEvent).filter(MatchEvent.player_id == player_id)
    if match_id:
        query = query.filter(MatchEvent.match_id == match_id)
    elif last_n:
        match_ids = [m.id for m in db.query(Match).filter(
            Match.status == "completed"
        ).order_by(Match.date.desc()).limit(last_n).all()]
        query = query.filter(MatchEvent.match_id.in_(match_ids))
    events = query.all()

    setter_dumps = sum(1 for e in events if e.event_type == "setter_dump")
    kills = sum(1 for e in events if e.event_type == "kill") + setter_dumps
    kill_blocks = sum(1 for e in events if e.event_type == "kill_block")
    spikes = sum(1 for e in events if e.event_type == "spike")
    errors = sum(1 for e in events if e.event_type in {"error", "spike_error"})
    aces = sum(1 for e in events if e.event_type == "ace")
    serve_errors = sum(1 for e in events if e.event_type == "serve_error")
    blocks = sum(1 for e in events if e.event_type == "block")
    digs = sum(1 for e in events if e.event_type == "dig")
    assists = sum(1 for e in events if e.event_type == "assist")
    serves = sum(1 for e in events if e.event_type == "serve")
    passes = [e for e in events if e.event_type == "pass"]
    pass_contexts = db.query(MatchEventContext).filter(
        MatchEventContext.event_id.in_([e.id for e in passes])
    ).all() if passes else []
    pass_ratings = [context.pass_rating for context in pass_contexts
                    if context.pass_rating is not None]


    total_attacks = kills + spikes + errors
    total_serves = aces + serve_errors + serves

    return {
      "player_id": player_id,
      "kills": kills,
      "kill_blocks": kill_blocks,
      "setter_dumps": setter_dumps,
      "spikes": spikes,
      "errors": errors,
      "aces": aces,
      "serve_errors": serve_errors,
      "blocks": blocks,
      "digs": digs,
      "assists": assists,
      "kill_pct": round((kills / total_attacks) * 100, 1) if total_attacks > 0 else 0,
      "serve_pct": round((aces / total_serves) * 100, 1) if total_serves > 0 else 0,
      "serve_error_rate": round((serve_errors / total_serves) * 100, 1) if total_serves > 0 else 0,
      "attack_efficiency": round(((kills - errors) / total_attacks) * 100, 1) if total_attacks > 0 else 0,
      "pass_average": round(sum(pass_ratings) / len(pass_ratings), 2) if pass_ratings else None,
      "pass_count": len(pass_ratings),
      "total_attacks": total_attacks,
      "total_serves": total_serves,
    }

@router.get("/player/{player_id}")
def player_analytics(player_id: int, last_n: Optional[int] = None,
                     db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    stats = get_player_stats(player_id, db, last_n=last_n)
    stats["name"] = player.name if player else "Unknown"
    stats["position"] = player.position if player else None
    return stats

@router.get("/player/{player_id}/matches")
def player_match_history(player_id: int, db: Session = Depends(get_db)):
    events = db.query(MatchEvent).filter(
        MatchEvent.player_id == player_id).all()
    match_ids = list(set(e.match_id for e in events))
    history = []
    for mid in match_ids:
        match = db.query(Match).filter(Match.id == mid).first()
        if not match or match.status != "completed":
            continue
        stats = get_player_stats(player_id, db, match_id=mid)
        sets = db.query(SetScore).filter(SetScore.match_id == mid).all()
        sets_won = sum(1 for s in sets if s.our_score > s.opponent_score)
        sets_lost = sum(1 for s in sets if s.opponent_score > s.our_score)
        history.append({
            "match_id": mid,
            "date": match.date.strftime("%d %b %Y"),
            "result": f"{sets_won}–{sets_lost}",
            "kills": stats["kills"],
            "aces": stats["aces"],
            "blocks": stats["blocks"],
            "digs": stats["digs"],
            "kill_pct": stats["kill_pct"],
            "attack_efficiency": stats["attack_efficiency"],
        })
    return sorted(history, key=lambda x: x["match_id"], reverse=True)

@router.get("/team/{team_id}")
def team_analytics(team_id: int, last_n: Optional[int] = None,
                   db: Session = Depends(get_db)):
    players = db.query(Player).filter(Player.team_id == team_id).all()
    player_stats = []
    for p in players:
        stats = get_player_stats(p.id, db, last_n=last_n)
        stats["name"] = p.name
        stats["position"] = p.position
        player_stats.append(stats)

    total_kills = sum(s["kills"] for s in player_stats)
    total_kill_blocks = sum(s["kill_blocks"] for s in player_stats)
    total_errors = sum(s["errors"] for s in player_stats)
    total_attacks = sum(s["total_attacks"] for s in player_stats)
    total_aces = sum(s["aces"] for s in player_stats)
    total_serve_errors = sum(s["serve_errors"] for s in player_stats)
    total_serves = sum(s["total_serves"] for s in player_stats)
    total_blocks = sum(s["blocks"] for s in player_stats)
    total_digs = sum(s["digs"] for s in player_stats)
    pass_total = sum(s["pass_average"] * s["pass_count"] for s in player_stats
                     if s["pass_average"] is not None)
    pass_count = sum(s["pass_count"] for s in player_stats)

    return {
        "team_id": team_id,
        "players": player_stats,
        "team_kill_pct": round((total_kills / total_attacks) * 100, 1) if total_attacks > 0 else 0,
        "team_kill_block_pct": round((total_kill_blocks / total_attacks) * 100, 1) if total_attacks > 0 else 0,
        "team_serve_pct": round((total_aces / total_serves) * 100, 1) if total_serves > 0 else 0,
        "team_serve_error_rate": round((total_serve_errors / total_serves) * 100, 1) if total_serves > 0 else 0,
        "team_pass_average": round(pass_total / pass_count, 2) if pass_count else None,
        "team_pass_count": pass_count,
    }

@router.get("/team/{team_id}/rotations")
def rotation_analytics(team_id: int, last_n: Optional[int] = None,
                       db: Session = Depends(get_db)):
    match_query = db.query(Match).filter(
        Match.our_team_id == team_id,
        Match.status == "completed",
    ).order_by(Match.date.desc())
    if last_n:
        match_query = match_query.limit(last_n)
    match_ids = [match.id for match in match_query.all()]

    rotations = []
    for number in range(1, 7):
        rows = db.query(MatchEvent, MatchEventContext).join(
            MatchEventContext, MatchEventContext.event_id == MatchEvent.id
        ).filter(
            MatchEvent.match_id.in_(match_ids),
            MatchEventContext.rotation_number == number,
        ).all() if match_ids else []
        point_rows = [(event, context) for event, context in rows
                      if event.event_type in {"kill", "ace", "our_point", "kill_block", "setter_dump",
                                              "serve_error", "opponent_point",
                                              "foot_fault", "net_touch", "spike_error"}]
        points_for = sum(1 for event, _ in point_rows
                         if event.event_type in {"kill", "ace", "our_point", "kill_block", "setter_dump"})
        points_against = len(point_rows) - points_for
        receive_rallies = [(event, context) for event, context in point_rows
                           if not context.we_were_serving]
        sideouts = sum(1 for event, _ in receive_rallies
                       if event.event_type in {"kill", "our_point", "kill_block", "setter_dump"})
        rotations.append({
            "rotation": number,
            "points_for": points_for,
            "points_against": points_against,
            "point_difference": points_for - points_against,
            "sideout_attempts": len(receive_rallies),
            "sideouts": sideouts,
            "sideout_pct": round(sideouts / len(receive_rallies) * 100, 1)
                if receive_rallies else None,
        })

    total_attempts = sum(rotation["sideout_attempts"] for rotation in rotations)
    total_sideouts = sum(rotation["sideouts"] for rotation in rotations)
    return {
        "sideout_pct": round(total_sideouts / total_attempts * 100, 1)
            if total_attempts else None,
        "sideouts": total_sideouts,
        "sideout_attempts": total_attempts,
        "rotations": rotations,
    }

@router.get("/team/{team_id}/home-away")
def home_away_analytics(team_id: int, last_n: Optional[int] = None,
                        db: Session = Depends(get_db)):
    match_query = db.query(Match).filter(
        Match.our_team_id == team_id,
        Match.status == "completed",
    ).order_by(Match.date.desc())
    if last_n:
        match_query = match_query.limit(last_n)
    matches = match_query.all()

    def summarize(group):
        match_ids = [match.id for match in group]
        events = db.query(MatchEvent).filter(
            MatchEvent.match_id.in_(match_ids)).all() if match_ids else []
        kills = sum(event.event_type in {"kill", "setter_dump"} for event in events)
        attacks = sum(event.event_type in {"kill", "setter_dump", "spike", "error", "spike_error"}
                      for event in events)
        serve_errors = sum(event.event_type == "serve_error" for event in events)
        serves = sum(event.event_type in {"serve", "ace", "serve_error"}
                     for event in events)

        wins = 0
        for match in group:
            sets = db.query(SetScore).filter_by(match_id=match.id).all()
            won = sum(score.our_score > score.opponent_score for score in sets)
            lost = sum(score.opponent_score > score.our_score for score in sets)
            wins += won > lost

        context_rows = db.query(MatchEvent, MatchEventContext).join(
            MatchEventContext, MatchEventContext.event_id == MatchEvent.id
        ).filter(MatchEvent.match_id.in_(match_ids)).all() if match_ids else []
        receive_points = [(event, context) for event, context in context_rows
                          if not context.we_were_serving and
                          event.event_type in {"kill", "our_point", "kill_block", "setter_dump",
                                               "serve_error", "opponent_point",
                                               "foot_fault", "net_touch", "spike_error"}]
        sideouts = sum(event.event_type in {"kill", "our_point", "kill_block", "setter_dump"}
                       for event, _ in receive_points)
        return {
            "matches": len(group),
            "wins": wins,
            "losses": len(group) - wins,
            "win_pct": round(wins / len(group) * 100, 1) if group else None,
            "kill_pct": round(kills / attacks * 100, 1) if attacks else None,
            "serve_error_rate": round(serve_errors / serves * 100, 1)
                if serves else None,
            "sideout_pct": round(sideouts / len(receive_points) * 100, 1)
                if receive_points else None,
        }

    return {
        "home": summarize([match for match in matches
                           if match.home_team_id == team_id]),
        "away": summarize([match for match in matches
                           if match.away_team_id == team_id]),
    }

@router.get("/team/{team_id}/trend")
def team_trend(team_id: int, last_n: int = 5, db: Session = Depends(get_db)):
    matches = db.query(Match).filter(
        (Match.home_team_id == team_id) | (Match.away_team_id == team_id),
        Match.status == "completed"
    ).order_by(Match.date.desc()).limit(last_n).all()

    trend = []
    for match in reversed(matches):
        events = db.query(MatchEvent).filter(
            MatchEvent.match_id == match.id).all()
        player_ids = [p.id for p in db.query(Player).filter(
            Player.team_id == team_id).all()]
        our_events = [e for e in events if e.player_id in player_ids]

        kills = sum(1 for e in our_events
                    if e.event_type in {"kill", "setter_dump"})
        errors = sum(1 for e in our_events
                     if e.event_type in {"error", "spike_error"})
        spikes = sum(1 for e in our_events if e.event_type == "spike")
        aces = sum(1 for e in our_events if e.event_type == "ace")
        serve_errors = sum(1 for e in our_events if e.event_type == "serve_error")
        total_attacks = kills + spikes + errors
        total_serves = aces + serve_errors

        sets = db.query(SetScore).filter(
            SetScore.match_id == match.id).all()
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

@router.get("/team/{team_id}/top-performers")
def top_performers(team_id: int, db: Session = Depends(get_db)):
    players = db.query(Player).filter(Player.team_id == team_id).all()
    if not players:
        return {}

    def best(stat):
        ranked = sorted(
            [{"name": p.name, "value": get_player_stats(p.id, db)[stat]}
             for p in players],
            key=lambda x: x["value"], reverse=True
        )
        return ranked[0] if ranked and ranked[0]["value"] > 0 else None

    return {
        "most_kills": best("kills"),
        "most_blocks": best("blocks"),
        "most_digs": best("digs"),
        "most_aces": best("aces"),
        "highest_kill_pct": best("kill_pct"),
        "highest_attack_efficiency": best("attack_efficiency"),
    }

@router.get("/team/{team_id}/match-count")
def team_match_count(team_id: int, db: Session = Depends(get_db)):
    count = db.query(Match).filter(
        (Match.home_team_id == team_id) | (Match.away_team_id == team_id),
        Match.status == "completed"
    ).count()
    return {"count": count}

@router.get("/match/{match_id}/top")
def match_top_performers(match_id: int, db: Session = Depends(get_db)):
    events = db.query(MatchEvent).filter(
        MatchEvent.match_id == match_id,
        MatchEvent.player_id.isnot(None)
    ).all()

    if not events:
        return {}

    player_ids = list(set(e.player_id for e in events))
    stats = {}
    for pid in player_ids:
        p = db.query(Player).filter(Player.id == pid).first()
        if not p:
            continue
        p_events = [e for e in events if e.player_id == pid]
        kills = sum(1 for e in p_events
                    if e.event_type in {"kill", "setter_dump"})
        blocks = sum(1 for e in p_events if e.event_type == "block")
        aces = sum(1 for e in p_events if e.event_type == "ace")
        digs = sum(1 for e in p_events if e.event_type == "dig")
        stats[pid] = {
            "name": p.name,
            "kills": kills,
            "blocks": blocks,
            "aces": aces,
            "digs": digs,
        }

    def top(stat):
        ranked = sorted(stats.values(), key=lambda x: x[stat], reverse=True)
        return ranked[0] if ranked and ranked[0][stat] > 0 else None

    return {
        "most_kills": top("kills"),
        "most_blocks": top("blocks"),
        "most_aces": top("aces"),
        "most_digs": top("digs"),
    }
