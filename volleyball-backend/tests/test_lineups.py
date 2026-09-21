import os
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret-not-used-in-production"

import pytest
from fastapi import HTTPException

from database import SessionLocal, engine
from models import (
    Availability, Base, Match, MatchEvent, MatchEventContext, MatchLineup,
    MatchSubstitution, MatchTrackerState, Player, SetScore, Team, User,
)
from routers.matches import (
    create_match,
    delete_match,
    get_spectator_snapshot,
    log_event,
    save_tracker_state,
    set_lineup,
    undo_last_event,
)
from routers.analytics import home_away_analytics, rotation_analytics
from routers.players import PlayerProfileUpdate, promote_captain, update_player_profile
from schemas import MatchCreate, MatchEventCreate, MatchLineupUpdate, MatchTrackerStateUpdate


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


def test_admin_can_delete_match_and_all_tracking_data(lineup_data):
    db, admin, match, players, _ = lineup_data
    event = MatchEvent(
        match_id=match.id, player_id=players[0].id,
        event_type="kill", set_number=1,
    )
    db.add(event)
    db.flush()
    db.add_all([
        MatchEventContext(
            event_id=event.id, rotation_number=1, we_were_serving=True),
        MatchLineup(match_id=match.id, player_id=players[0].id),
        MatchTrackerState(match_id=match.id),
        MatchSubstitution(
            match_id=match.id, set_number=1, sequence=1,
            player_out_id=players[0].id, player_in_id=players[1].id,
            rotation_number=1,
        ),
        Availability(
            match_id=match.id, player_id=players[0].id, status="available"),
        SetScore(match_id=match.id, set_number=1, our_score=25, opponent_score=20),
    ])
    db.commit()

    response = delete_match(match.id, db, admin)

    assert response == {"message": "Match and its tracking data deleted"}
    assert db.query(Match).filter_by(id=match.id).first() is None
    assert db.query(MatchEvent).count() == 0
    assert db.query(MatchEventContext).count() == 0
    assert db.query(MatchLineup).count() == 0
    assert db.query(MatchTrackerState).count() == 0
    assert db.query(MatchSubstitution).count() == 0
    assert db.query(Availability).count() == 0
    assert db.query(SetScore).count() == 0
    assert db.query(Player).count() == 8


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


def test_spectator_snapshot_includes_pass_rating(lineup_data):
    db, admin, match, players, _ = lineup_data
    event = log_event(match.id, MatchEventCreate(
        match_id=match.id,
        player_id=players[0].id,
        event_type="pass",
        set_number=1,
        rotation_number=1,
        we_are_serving=False,
        pass_rating=3,
    ), db, admin)

    snapshot = get_spectator_snapshot(match.id, db)

    assert snapshot["events"][0]["id"] == event.id
    assert snapshot["events"][0]["pass_rating"] == 3


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


def test_home_away_analytics_separates_location(lineup_data):
    db, admin, match, players, _ = lineup_data
    for event_type in ["kill", "serve", "serve_error"]:
        log_event(match.id, MatchEventCreate(
            match_id=match.id,
            player_id=players[0].id,
            event_type=event_type,
            set_number=1,
            rotation_number=1,
            we_are_serving=event_type != "kill",
        ), db, admin)
    from models import SetScore
    db.add(SetScore(match_id=match.id, set_number=1,
                    our_score=25, opponent_score=20))
    match.status = "completed"
    db.commit()

    stats = home_away_analytics(match.our_team_id, db=db)

    assert stats["home"]["matches"] == 1
    assert stats["home"]["wins"] == 1
    assert stats["home"]["serve_error_rate"] == 50.0
    assert stats["home"]["sideout_pct"] == 100.0
    assert stats["away"]["matches"] == 0


def test_admin_can_edit_player_name_and_clear_details(lineup_data):
    db, admin, _, players, _ = lineup_data
    player = players[0]
    player.jersey_number = 12
    player.position = "Setter"
    db.commit()

    updated = update_player_profile(
        player.id,
        PlayerProfileUpdate(name="  New Name  ", jersey_number=None, position=None),
        db,
        admin,
    )

    assert updated.name == "New Name"
    assert updated.jersey_number is None
    assert updated.position is None


def test_player_without_account_can_be_named_team_captain(lineup_data):
    db, admin, _, players, _ = lineup_data
    players[0].is_captain = True
    db.commit()

    response = promote_captain(players[1].id, db, admin)

    db.refresh(players[0])
    db.refresh(players[1])
    assert players[0].is_captain is False
    assert players[1].is_captain is True
    assert response == {"message": "Player 2 is now team captain"}


def test_roster_captain_badge_does_not_change_login_permissions(lineup_data):
    db, admin, _, players, _ = lineup_data
    player_user = User(
        email="player@example.com",
        hashed_password="unused",
        name="Player 1",
        role="player",
    )
    db.add(player_user)
    db.flush()
    players[0].user_id = player_user.id
    db.commit()

    promote_captain(players[0].id, db, admin)

    db.refresh(player_user)
    assert players[0].is_captain is True
    assert player_user.role == "player"


def test_league_match_rejects_team_from_another_division(lineup_data):
    db, admin, _, _, _ = lineup_data
    home = db.query(Team).filter(Team.name == "Glasgow").one()
    other_division = Team(name="Other Division", division="Men's Div 1")
    db.add(other_division)
    db.commit()

    with pytest.raises(HTTPException, match="same division") as exc:
        create_match(MatchCreate(
            home_team_id=home.id,
            away_team_id=other_division.id,
            our_team_id=home.id,
            date=datetime(2026, 10, 1, 19, 0),
            match_type="league",
        ), db, admin)

    assert exc.value.status_code == 400


@pytest.mark.parametrize("match_type", ["cup", "friendly"])
def test_non_league_match_allows_other_division_of_same_gender(lineup_data, match_type):
    db, admin, _, _, _ = lineup_data
    home = db.query(Team).filter(Team.name == "Glasgow").one()
    other_division = Team(name=f"{match_type} Opponent", division="Men's Div 2")
    db.add(other_division)
    db.commit()

    created = create_match(MatchCreate(
        home_team_id=home.id,
        away_team_id=other_division.id,
        our_team_id=home.id,
        date=datetime(2026, 10, 1, 19, 0),
        match_type=match_type,
    ), db, admin)

    assert created.match_type == match_type


def test_non_league_match_rejects_other_gender(lineup_data):
    db, admin, _, _, _ = lineup_data
    home = db.query(Team).filter(Team.name == "Glasgow").one()
    womens_team = Team(name="Women's Opponent", division="Women's Div 1")
    db.add(womens_team)
    db.commit()

    with pytest.raises(HTTPException, match="cannot play each other") as exc:
        create_match(MatchCreate(
            home_team_id=home.id,
            away_team_id=womens_team.id,
            our_team_id=home.id,
            date=datetime(2026, 10, 1, 19, 0),
            match_type="friendly",
        ), db, admin)

    assert exc.value.status_code == 400
