from datetime import date, datetime, time, timezone

import pytest

from app.data import Snapshot
from app.forecast import day_ahead_cutoff, horizon_cutoff, match


def utc(day: int, hour: int, minute: int = 0, month: int = 1, year: int = 2026) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def make_snapshot(actuals: dict, forecasts: dict) -> Snapshot:
    return Snapshot(
        fetched_at="test",
        actuals=actuals,
        forecast_published={t: [p for p, _ in pairs] for t, pairs in forecasts.items()},
        forecast_generation={t: [g for _, g in pairs] for t, pairs in forecasts.items()},
    )


SLOT = utc(2, 12)
SNAP = make_snapshot(
    actuals={SLOT: 1000, utc(2, 12, 30): 1100, utc(2, 13): 1200},
    forecasts={
        SLOT: [
            (utc(31, 9, 30, month=12, year=2025), 900),  # 50.5h before
            (utc(1, 9, 30), 950),  # 26.5h before
            (utc(1, 12), 980),  # exactly 24h before
            (utc(2, 9, 30), 1050),  # 2.5h before
        ],
    },
)
DAY = date(2026, 1, 2)


@pytest.mark.parametrize(
    ("hours", "expected"),
    [(0, 1050), (2.5, 1050), (3, 980), (24, 980), (25, 950), (48, 900)],
)
def test_horizon_picks_latest_forecast_at_or_before_cutoff(hours, expected):
    result = match(SNAP, DAY, DAY, horizon_cutoff(hours))
    forecasts = [s.forecast for s in result.slots if s.start_time == SLOT]
    assert forecasts == [expected]


def test_only_hourly_slots_are_compared_and_unmatched_are_counted():
    result = match(SNAP, DAY, DAY, horizon_cutoff(0))
    assert [s.start_time for s in result.slots] == [SLOT]
    assert result.unmatched == [utc(2, 13)]  # has an actual but no forecast
    assert result.total == 2


def test_error_is_forecast_minus_actual():
    (slot,) = match(SNAP, DAY, DAY, horizon_cutoff(24)).slots
    assert (slot.forecast, slot.actual, slot.error) == (980, 1000, -20)
    assert slot.publish_time == utc(1, 12)


@pytest.mark.parametrize(
    ("cutoff", "expected"),
    [(time(9, 0), 900), (time(9, 30), 950), (time(12, 0), 980), (time(23, 0), 980)],
)
def test_day_ahead_uses_fixed_time_on_previous_day(cutoff, expected):
    (slot,) = match(SNAP, DAY, DAY, day_ahead_cutoff(cutoff)).slots
    assert slot.forecast == expected


def test_date_range_filters_slots():
    assert match(SNAP, date(2026, 1, 3), date(2026, 1, 31), horizon_cutoff(0)).total == 0


@pytest.mark.parametrize("hours", [-1, 48.5])
def test_horizon_outside_range_is_rejected(hours):
    with pytest.raises(ValueError):
        horizon_cutoff(hours)


@pytest.mark.parametrize(
    ("start", "end"),
    [(date(2025, 12, 31), date(2026, 1, 2)), (date(2026, 1, 30), date(2026, 2, 1)), (date(2026, 1, 5), date(2026, 1, 4))],
)
def test_dates_outside_january_or_reversed_are_rejected(start, end):
    with pytest.raises(ValueError):
        match(SNAP, start, end, horizon_cutoff(0))
