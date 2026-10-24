"""API tests against the real January 2026 snapshot."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert (body["periodStart"], body["periodEnd"]) == ("2026-01-01", "2026-01-31")


def test_metrics_default_is_24h_horizon_over_january():
    body = client.get("/api/metrics").json()
    assert body["selection"] == {
        "start": "2026-01-01", "end": "2026-01-31", "mode": "horizon", "horizon": 24.0, "cutoff": None,
    }
    assert body["coverage"] == {"slotsUsed": 744, "slotsTotal": 744, "partialCoverage": False}
    # Matches the Phase 1 exploration (plans/data-notes.md).
    assert round(body["mae"]) == 2050
    assert round(body["bias"]) == 1854


def test_metrics_flags_partial_coverage_at_48h():
    body = client.get("/api/metrics", params={"horizon": 48}).json()
    assert body["coverage"] == {"slotsUsed": 589, "slotsTotal": 744, "partialCoverage": True}


def test_metrics_day_ahead_mode():
    body = client.get("/api/metrics", params={"mode": "day_ahead", "cutoff": "09:00"}).json()
    assert body["selection"]["horizon"] is None
    assert body["selection"]["cutoff"] == "09:00:00"
    assert body["coverage"]["slotsUsed"] == 744
    assert body["mae"] == pytest.approx(2127, abs=1)


def test_generation_for_one_day():
    body = client.get("/api/generation", params={"start": "2026-01-10", "end": "2026-01-10"}).json()
    assert len(body["slots"]) == 24
    assert len(body["actuals"]) == 48
    first = body["slots"][0]
    assert first["startTime"] == "2026-01-10T00:00:00Z"
    assert first["error"] == first["forecast"] - first["actual"]
    assert body["actuals"][1]["startTime"] == "2026-01-10T00:30:00Z"


def test_generation_keeps_unmatched_slots_with_null_forecast():
    body = client.get("/api/generation", params={"horizon": 48}).json()
    unmatched = [s for s in body["slots"] if s["forecast"] is None]
    assert len(body["slots"]) == 744
    assert len(unmatched) == 155
    assert all(s["publishTime"] is None and s["error"] is None for s in unmatched)


def test_error_profile_has_24_hours():
    body = client.get("/api/error-profile").json()
    assert [h["hour"] for h in body["hours"]] == list(range(24))
    assert sum(h["slots"] for h in body["hours"]) == 744


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"horizon": 49}, 422),
        ({"horizon": -1}, 422),
        ({"mode": "weekly"}, 422),
        ({"start": "not-a-date"}, 422),
        ({"cutoff": "25:00", "mode": "day_ahead"}, 422),
        ({"start": "2025-12-31"}, 400),
        ({"start": "2026-01-10", "end": "2026-01-09"}, 400),
    ],
)
def test_invalid_input_is_rejected(params, status):
    resp = client.get("/api/metrics", params=params)
    assert resp.status_code == status
    detail = resp.json()["detail"]
    if status == 422:
        assert len(detail) == 1  # each problem is reported once
