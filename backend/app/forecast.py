"""Pick the forecast a trader would have had for each hourly slot.

For every slot we take the latest forecast published at or before a cutoff.
Two ways of setting the cutoff are supported:
- horizon mode: the cutoff is H hours before the slot starts;
- day-ahead mode: the cutoff is a fixed time on the day before delivery.
"""

from bisect import bisect_right
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable

from app.data import PERIOD_END, PERIOD_START, Snapshot

MIN_HORIZON_H = 0
MAX_HORIZON_H = 48
DEFAULT_HORIZON_H = 24
# Assumed decision time, before the morning day-ahead auctions. January is GMT, so UK time = UTC.
DEFAULT_DAY_AHEAD_CUTOFF = time(9, 0)

Cutoff = Callable[[datetime], datetime]


@dataclass(frozen=True)
class MatchedSlot:
    start_time: datetime
    actual: int
    forecast: int
    publish_time: datetime
    error: int  # forecast - actual, MW


@dataclass(frozen=True)
class MatchResult:
    slots: list[MatchedSlot]
    unmatched: list[datetime]  # hourly slots with an actual but no eligible forecast

    @property
    def total(self) -> int:
        return len(self.slots) + len(self.unmatched)


def horizon_cutoff(hours: float) -> Cutoff:
    if not MIN_HORIZON_H <= hours <= MAX_HORIZON_H:
        raise ValueError(f"horizon must be between {MIN_HORIZON_H} and {MAX_HORIZON_H} hours")
    lead = timedelta(hours=hours)
    return lambda slot: slot - lead


def day_ahead_cutoff(at: time = DEFAULT_DAY_AHEAD_CUTOFF) -> Cutoff:
    # Delivery day is the UK calendar day; in January that is the UTC date.
    return lambda slot: datetime.combine(slot.date() - timedelta(days=1), at, timezone.utc)


def slot_range(start: date, end: date) -> tuple[datetime, datetime]:
    """Inclusive delivery dates -> [from, to) datetimes, limited to the snapshot period."""
    if start > end:
        raise ValueError("start must not be after end")
    slot_from = datetime.combine(start, time(0), timezone.utc)
    slot_to = datetime.combine(end + timedelta(days=1), time(0), timezone.utc)
    if slot_from < PERIOD_START or slot_to > PERIOD_END:
        raise ValueError(f"dates must be within {PERIOD_START.date()} and {(PERIOD_END - timedelta(days=1)).date()}")
    return slot_from, slot_to


def latest_before(snapshot: Snapshot, slot: datetime, cutoff: datetime) -> tuple[datetime, int] | None:
    published = snapshot.forecast_published.get(slot, [])
    i = bisect_right(published, cutoff)
    if i == 0:
        return None
    return published[i - 1], snapshot.forecast_generation[slot][i - 1]


def match(snapshot: Snapshot, start: date, end: date, cutoff: Cutoff) -> MatchResult:
    """Match hourly actuals between start and end (inclusive) with the latest forecast before the cutoff."""
    slot_from, slot_to = slot_range(start, end)
    slots, unmatched = [], []
    for slot, actual in snapshot.actuals.items():
        # WINDFOR is hourly, so only on-the-hour actuals are compared.
        if slot.minute != 0 or not slot_from <= slot < slot_to:
            continue
        pick = latest_before(snapshot, slot, cutoff(slot))
        if pick is None:
            unmatched.append(slot)
            continue
        publish_time, forecast = pick
        slots.append(MatchedSlot(slot, actual, forecast, publish_time, forecast - actual))
    return MatchResult(slots, unmatched)
