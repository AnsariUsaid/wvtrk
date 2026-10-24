import math
from datetime import datetime, timezone

import pytest

from app.forecast import MatchedSlot, MatchResult
from app.metrics import error_by_hour, summarise


def slot(hour: int, actual: int, forecast: int) -> MatchedSlot:
    start = datetime(2026, 1, 5, hour, tzinfo=timezone.utc)
    return MatchedSlot(start, actual, forecast, start, forecast - actual)


RESULT = MatchResult(
    slots=[slot(0, 1000, 1100), slot(0, 2000, 1800), slot(1, 3000, 3300)],  # errors +100, -200, +300
    unmatched=[datetime(2026, 1, 5, 2, tzinfo=timezone.utc)],
)


def test_summary_metrics():
    s = summarise(RESULT)
    assert (s.slots_used, s.slots_total) == (3, 4)
    assert s.mae == pytest.approx(200)
    assert s.rmse == pytest.approx(math.sqrt((100**2 + 200**2 + 300**2) / 3))
    assert s.bias == pytest.approx(200 / 3)
    assert s.mean_actual == pytest.approx(2000)
    assert s.nmae == pytest.approx(10)


def test_summary_with_no_matched_slots():
    s = summarise(MatchResult(slots=[], unmatched=RESULT.unmatched))
    assert (s.slots_used, s.slots_total, s.mae, s.rmse, s.bias, s.nmae) == (0, 1, None, None, None, None)


def test_error_by_hour():
    rows = error_by_hour(RESULT)
    assert [(r.hour, r.slots, r.mean_error, r.mae) for r in rows] == [(0, 2, -50, 150), (1, 1, 300, 300)]
