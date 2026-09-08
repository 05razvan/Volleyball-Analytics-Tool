import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret-not-used-in-production"

import pytest
from fastapi import HTTPException

from database import SessionLocal, engine
from models import Base, Match, MatchLineup, Player, Team, User
from routers.matches import log_event, save_tracker_state, set_lineup, undo_last_event
from routers.analytics import rotation_analytics
from schemas import MatchEventCreate, MatchLineupUpdate, MatchTrackerStateUpdate


@pytest.fixture()
def lineup_data():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    admin = User(
        email="admin@example.com",
        hashed_password="unused",
        name="Admin",
        role="admin",
    )
    our_team = Team(name="Glasgow", division="Men's Premier")
    opponent = Team(name="Opponent", division="Men's Premier")
    db.add_all([admin, our_team, opponent])
    db.flush()

    players = [Player(name=f"Player {number}", team_id=our_team.id)
               for number in range(1, 8)]
    outsider = Player(name="Outsider", team_id=opponent.id)
    db.add_all([*players, outsider])
    db.flush()

    match = Match(
        home_team_id=our_team.id,
        away_team_id=opponent.id,
        our_team_id=our_team.id,
        status="live",
        current_set=1,
    )
    db.add(match)
    db.commit()
    try:
        yield db, admin, match, players, outsider
    finally:
        db.close()


def test_saves_six_player_lineup_and_bench(lineup_data):
    db, admin, match, players, _ = lineup_data

    response = set_lineup(
        match.id,
        MatchLineupUpdate(
            on_court=[player.id for player in players[:6]],
            bench=[players[6].id],
        ),
        db,
        admin,
    )

    saved = db.query(MatchLineup).filter_by(match_id=match.id).all()
    assert response == {"message": "Lineup saved"}
    assert sum(entry.is_on_court for entry in saved) == 6
    assert sum(not entry.is_on_court for entry in saved) == 1


@pytest.mark.parametrize(
    ("on_court", "bench", "message"),
    [
        ([1, 2, 3, 4, 5], [6], "exactly 6"),
        ([1, 2, 3, 4, 5, 6], [6], "more than once"),
    ],
)
def test_rejects_malformed_lineup(lineup_data, on_court, bench, message):
    db, admin, match, _, _ = lineup_data

    with pytest.raises(HTTPException, match=message) as exc:
        set_lineup(
            match.id,
            MatchLineupUpdate(on_court=on_court, bench=bench),
            db,
            admin,
        )

    assert exc.value.status_code == 400


def test_rejects_player_from_another_team(lineup_data):
    db, admin, match, players, outsider = lineup_data

    with pytest.raises(HTTPException, match="tracking team") as exc:
        set_lineup(
            match.id,
            MatchLineupUpdate(
                on_court=[player.id for player in players[:5]] + [outsider.id],
                bench=[],
            ),
            db,
            admin,
        )

    assert exc.value.status_code == 400


def test_join_request_routes_are_registered():
    from main import app

    paths = set(app.openapi()["paths"])
    assert "/join-requests/" in paths
    assert "/join-requests/pending" in paths


def test_event_undo_restores_persisted_tracker_state(lineup_data):
    db, admin, match, players, _ = lineup_data
    ids = [player.id for player in players]
    original = MatchTrackerStateUpdate(
        positions=ids[:6], bench=ids[6:], we_are_serving=False,
        rotation_number=1, passing_enabled=True,
    )
    save_tracker_state(match.id, original, db, admin)
    event = log_event(match.id, MatchEventCreate(
        match_id=match.id,
        player_id=ids[0],
        event_type="kill",
        set_number=1,
        rotation_number=1,
        we_are_serving=False,
        state_before=original.model_dump(),
    ), db, admin)
    save_tracker_state(match.id, MatchTrackerStateUpdate(
        positions=ids[1:6] + ids[:1], bench=ids[6:], we_are_serving=True,
        rotation_number=2, passing_enabled=True,
    ), db, admin)

    result = undo_last_event(match.id, db, admin)

    assert result["event"]["id"] == event.id
    assert result["restored_state"]["positions"] == ids[:6]
    from models import MatchTrackerState
    saved = db.query(MatchTrackerState).filter_by(match_id=match.id).one()
    assert saved.rotation_number == 1
    assert saved.we_are_serving is False


def test_rejects_invalid_pass_rating(lineup_data):
    db, admin, match, players, _ = lineup_data

    with pytest.raises(HTTPException, match="Pass rating"):
        log_event(match.id, MatchEventCreate(
            match_id=match.id,
            player_id=players[0].id,
            event_type="pass",
            set_number=1,
            rotation_number=1,
            pass_rating=4,
        ), db, admin)


def test_rotation_analytics_calculates_sideout_rate(lineup_data):
    db, admin, match, players, _ = lineup_data
    for event_type, serving in [
        ("kill", False),
        ("opponent_point", False),
        ("ace", True),
    ]:
        log_event(match.id, MatchEventCreate(
            match_id=match.id,
            player_id=players[0].id if event_type != "opponent_point" else None,
            event_type=event_type,
            set_number=1,
            rotation_number=3,
            we_are_serving=serving,
        ), db, admin)
    match.status = "completed"
    db.commit()

    stats = rotation_analytics(match.our_team_id, db=db)
    rotation = stats["rotations"][2]

    assert stats["sideout_pct"] == 50.0
    assert rotation["points_for"] == 2
    assert rotation["points_against"] == 1
    assert rotation["sideout_attempts"] == 2
