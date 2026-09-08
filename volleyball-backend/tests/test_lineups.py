import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret-not-used-in-production"

import pytest
from fastapi import HTTPException

from database import SessionLocal, engine
from models import Base, Match, MatchLineup, Player, Team, User
from routers.matches import set_lineup
from schemas import MatchLineupUpdate


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
