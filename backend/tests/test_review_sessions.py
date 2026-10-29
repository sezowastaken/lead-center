import json
import math
from collections import Counter

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.database import get_db, utcnow
from app.main import app
from app.models import Location, OSMBusiness, ReviewSession, Sector
from app.models.enums import RecordState, RejectReason
from app.services.review import service as review
from app.services.review import sessions
from app.services.review.deck import build_deck, longest_run


# ---------- deck algorithm ----------

def _pool(**counts):
    items, bid = [], 0
    for sector, n in counts.items():
        for _ in range(n):
            bid += 1
            items.append((bid, sector))
    return items, {b: s for b, s in items}


@pytest.mark.parametrize("seed", range(20))
def test_balanced_pool_never_repeats_a_sector(seed):
    items, sector_of = _pool(beauty=8, tattoo=7, vet=6, furniture=5, photo=3)
    deck = build_deck(items, seed)
    assert sorted(deck) == sorted(b for b, _ in items)  # every business exactly once
    assert longest_run([sector_of[b] for b in deck]) == 1


@pytest.mark.parametrize("seed", range(20))
def test_dominant_sector_is_spread_evenly(seed):
    items, sector_of = _pool(beauty=10, tattoo=3, vet=2)
    seq = [sector_of[b] for b in build_deck(items, seed)]
    assert longest_run(seq) <= math.ceil(10 / (5 + 1))  # 2, not a 10-long Beauty tail
    assert sum(seq[i] == seq[i - 1] for i in range(1, len(seq))) == 10 - 5 - 1
    assert Counter(seq) == {"beauty": 10, "tattoo": 3, "vet": 2}


@pytest.mark.parametrize("seed", range(10))
def test_unavoidable_repeats_are_spread_not_bunched(seed):
    # Like the sandbox import: Beauty is 55% of the pool, so some Beauty pairs are unavoidable.
    items, sector_of = _pool(beauty=47, hair=13, tattoo=8, vet=6, furniture=6, pilates=3, photo=3)
    seq = [sector_of[b] for b in build_deck(items, seed)]
    assert longest_run(seq) <= 2
    pairs = [i for i in range(1, len(seq)) if seq[i] == seq[i - 1]]
    assert len(pairs) == 47 - 39 - 1  # exactly the unavoidable minimum, no more
    thirds = Counter(min(2, i * 3 // len(seq)) for i in pairs)
    assert all(thirds[t] >= 1 for t in range(3)), f"repeats bunched in one part of the deck: {thirds}"


def test_single_sector_pool_and_empty_pool():
    items, _ = _pool(beauty=4)
    assert len(build_deck(items, 1)) == 4
    assert build_deck([], 1) == []


def test_deck_is_deterministic_per_seed_and_random_across_seeds():
    items, _ = _pool(beauty=6, tattoo=6, vet=6)
    assert build_deck(items, 42) == build_deck(items, 42)
    assert len({tuple(build_deck(items, s)) for s in range(10)}) > 1


def test_deck_mirrors_the_pool_early_on():
    # The first half of the deck should already contain the big sector proportionally (not saved for last).
    items, sector_of = _pool(beauty=60, tattoo=20, vet=20)
    first_half = Counter(sector_of[b] for b in build_deck(items, 7)[:50])
    assert 25 <= first_half["beauty"] <= 35


# ---------- persisted sessions ----------

def _seed_businesses(db, per_sector: dict[str, int]):
    location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    osm_id = 10_000
    for name, n in per_sector.items():
        sector = db.scalar(select(Sector).where(Sector.name == name))
        for _ in range(n):
            osm_id += 1
            db.add(OSMBusiness(osm_type="node", osm_id=osm_id, name=f"{name} {osm_id}", sector_id=sector.id, location_id=location.id, raw_tags_json="{}"))
    db.commit()


POOL = {"Beauty / Aesthetics": 6, "Tattoo": 4, "Veterinary": 3, "Photography": 2}


def test_previous_next_behave_like_browser_history(db):
    _seed_businesses(db, POOL)
    s = sessions.create_session(db, {}, seed=5)
    deck = sessions.deck_of(s)
    at = lambda: deck[s.cursor]  # noqa: E731
    for _ in range(3):
        sessions.move(db, s, "next")
    k = at()
    sessions.move(db, s, "previous")
    c = at()
    sessions.move(db, s, "previous")
    assert at() == deck[1]
    sessions.move(db, s, "next")
    assert at() == c
    sessions.move(db, s, "next")
    assert at() == k
    sessions.move(db, s, "next")
    assert at() == deck[4]
    assert sessions.deck_of(s) == deck  # never reshuffled


def test_advance_skips_decided_items_and_completes(db):
    _seed_businesses(db, {"Tattoo": 2, "Veterinary": 2})
    s = sessions.create_session(db, {}, seed=1)
    deck = sessions.deck_of(s)
    review.reject(db, db.get(OSMBusiness, deck[1]), RejectReason.OTHER, None)
    sessions.move(db, s, "advance")
    assert s.cursor == 2
    sessions.move(db, s, "advance")
    sessions.move(db, s, "advance")
    assert s.cursor == 4 and s.status == sessions.COMPLETED
    sessions.move(db, s, "previous")
    assert s.status == sessions.ACTIVE and s.cursor == 3


def test_session_survives_restart_and_new_session_only_takes_eligible(db):
    _seed_businesses(db, POOL)
    s = sessions.create_session(db, {}, seed=9)
    deck = sessions.deck_of(s)
    sessions.move(db, s, "next")
    sessions.move(db, s, "next")
    review.reject(db, db.get(OSMBusiness, deck[0]), RejectReason.OTHER, None)
    review.approve(db, db.get(OSMBusiness, deck[1]))

    # "Restart": a brand-new DB session bound to the same database file.
    fresh = sessionmaker(bind=db.get_bind())()
    resumed = sessions.active_session(fresh)
    assert resumed.id == s.id and sessions.deck_of(resumed) == deck and resumed.cursor == 2
    summary = sessions.summary(fresh, resumed)
    assert summary["decided"] == 2 and summary["current_business_id"] == deck[2]

    new = sessions.create_session(fresh, {}, seed=10)
    assert set(sessions.deck_of(new)) == set(deck) - {deck[0], deck[1]}
    fresh.refresh(resumed)
    assert resumed.status == sessions.CLOSED
    fresh.close()


def test_session_filters(db):
    _seed_businesses(db, POOL)
    tattoo = db.scalar(select(Sector).where(Sector.name == "Tattoo"))
    s = sessions.create_session(db, {"sector_id": tattoo.id}, seed=3)
    ids = sessions.deck_of(s)
    assert len(ids) == 4
    assert {db.get(OSMBusiness, i).sector_id for i in ids} == {tattoo.id}
    assert json.loads(s.filters_json) == {"sector_id": tattoo.id}


def test_api_session_flow_and_daily_progress(db):
    _seed_businesses(db, {"Tattoo": 2, "Veterinary": 2})
    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        assert client.get("/api/review-sessions/current").json() == {"session": None}
        assert client.get("/api/review-sessions/eligible").json()["count"] == 4
        started = client.post("/api/review-sessions", json={}).json()
        assert started["total"] == 4 and started["business"]["id"] == started["current_business_id"]
        first = started["business"]["id"]
        client.post(f"/api/businesses/{first}/reject", json={"reason": "OTHER"})
        moved = client.post(f"/api/review-sessions/{started['id']}/move", json={"action": "advance"}).json()
        assert moved["cursor"] == 1 and moved["decided"] == 1
        back = client.post(f"/api/review-sessions/{started['id']}/move", json={"action": "previous"}).json()
        assert back["business"]["id"] == first and back["business"]["record_state"] == RecordState.REJECTED
        assert client.get("/api/review-sessions/current").json()["session"]["id"] == started["id"]

        progress = client.get("/api/review/progress").json()
        assert progress == {"reviewed_today": 1, "target": 30}
        assert client.put("/api/review/daily-target", json={"target": 20}).json()["target"] == 20
        assert client.put("/api/review/daily-target", json={"target": 0}).status_code == 422
    finally:
        app.dependency_overrides.clear()


# ---------- weighted decks ----------

@pytest.mark.parametrize("seed", range(10))
def test_weights_front_load_valuable_sectors_without_extra_repeats(seed):
    items, sector_of = _pool(hair=40, beauty=30, vet=30)  # hair is the biggest but least valuable
    weights = {"hair": 0.6, "beauty": 2.0, "vet": 1.8}
    seq = [sector_of[b] for b in build_deck(items, seed, weights)]
    assert Counter(seq) == {"hair": 40, "beauty": 30, "vet": 30}  # every business still in the deck once
    assert longest_run(seq) == 1  # no majority -> weights never cause a repeat
    first = Counter(seq[:30])
    assert first["hair"] < 0.4 * 30  # without weights it would be ~40%
    assert first["beauty"] + first["vet"] > 18


def test_unweighted_and_weight_one_are_identical():
    items, _ = _pool(a=5, b=7, c=3)
    assert build_deck(items, 11) == build_deck(items, 11, {"a": 1.0, "b": 1.0, "c": 1.0})


def test_weight_changes_only_affect_new_sessions(db):
    _seed_businesses(db, {"Beauty / Aesthetics": 5, "Tattoo": 5, "Hairdresser / Premium Hair Studio": 5})
    s1 = sessions.create_session(db, {}, seed=21)
    deck1 = sessions.deck_of(s1)
    hair = db.scalar(select(Sector).where(Sector.name == "Hairdresser / Premium Hair Studio"))
    hair.review_weight = 5.0
    db.commit()
    for _ in range(3):
        sessions.move(db, s1, "next")
    sessions.move(db, s1, "previous")
    assert sessions.deck_of(s1) == deck1  # stored deck untouched
    s2 = sessions.create_session(db, {}, seed=21)
    assert sessions.deck_of(s2) != deck1  # same seed, new weights -> different order


def test_review_weight_api(db):
    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        hair = next(s for s in client.get("/api/sectors").json() if s["name"].startswith("Hairdresser"))
        assert hair["review_weight"] == 0.6
        updated = client.put(f"/api/sectors/{hair['id']}/review-weight", json={"review_weight": 0.8}).json()
        assert updated["review_weight"] == 0.8
        assert client.put(f"/api/sectors/{hair['id']}/review-weight", json={"review_weight": 9}).status_code == 422
    finally:
        app.dependency_overrides.clear()
