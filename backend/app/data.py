"""The January 2026 data snapshot: its scope, file format and in-memory form.

The snapshot is built once by `scripts/build_snapshot.py` and shipped with the
app, so requests never have to call Elexon.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from app.elexon import format_ts, parse_ts

SNAPSHOT_PATH = Path(__file__).resolve().parents[1] / "data" / "snapshot.json"

# Delivery period covered by the app (end is exclusive).
PERIOD_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
PERIOD_END = datetime(2026, 2, 1, tzinfo=timezone.utc)
# Forecasts for early January were published in late December; the longest lead seen is 66h.
FORECAST_PUBLISH_FROM = PERIOD_START - timedelta(days=3)


@dataclass(frozen=True)
class Snapshot:
    fetched_at: str
    # Half-hourly actual generation (MW) by slot start.
    actuals: dict[datetime, int]
    # Hourly forecasts by slot start: publish times (ascending) and generation (MW).
    forecast_published: dict[datetime, list[datetime]]
    forecast_generation: dict[datetime, list[int]]


def to_json(fetched_at: datetime, actuals: dict, forecasts: dict) -> dict:
    return {
        "meta": {
            "source": "Elexon Insights API: FUELHH (fuelType WIND) and WINDFOR",
            "fetchedAt": format_ts(fetched_at),
            "periodStart": format_ts(PERIOD_START),
            "periodEnd": format_ts(PERIOD_END),
            "forecastPublishFrom": format_ts(FORECAST_PUBLISH_FROM),
        },
        "actuals": {format_ts(t): g for t, g in actuals.items()},
        "forecasts": {format_ts(t): [[format_ts(p), g] for p, g in pairs] for t, pairs in forecasts.items()},
    }


def from_json(raw: dict) -> Snapshot:
    published, generation = {}, {}
    for slot, pairs in raw["forecasts"].items():
        pairs = sorted((parse_ts(p), g) for p, g in pairs)
        published[parse_ts(slot)] = [p for p, _ in pairs]
        generation[parse_ts(slot)] = [g for _, g in pairs]
    return Snapshot(
        fetched_at=raw["meta"]["fetchedAt"],
        actuals={parse_ts(t): g for t, g in raw["actuals"].items()},
        forecast_published=published,
        forecast_generation=generation,
    )


@lru_cache(maxsize=1)
def load_snapshot(path: Path = SNAPSHOT_PATH) -> Snapshot:
    return from_json(json.loads(path.read_text()))
