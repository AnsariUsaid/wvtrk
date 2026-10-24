"""Fetch and clean national wind data from the Elexon Insights API.

Actuals come from FUELHH (fuelType WIND, half-hourly) and forecasts from
WINDFOR (hourly, published 8 times a day).
"""

import time
from datetime import date, datetime, timedelta, timezone

import requests

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
TIMEOUT_S = 60
RETRIES = 3


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def format_ts(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_stream(dataset: str, params: dict) -> list[dict]:
    for attempt in range(1, RETRIES + 1):
        try:
            resp = requests.get(f"{BASE_URL}/{dataset}/stream", params=params, timeout=TIMEOUT_S)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException:
            if attempt == RETRIES:
                raise
            time.sleep(2 * attempt)
    return []


def fetch_actuals(first_day: date, last_day: date) -> list[dict]:
    """Raw FUELHH WIND rows for settlement dates first_day..last_day, one call per day."""
    rows = []
    day = first_day
    while day <= last_day:
        rows += _get_stream(
            "FUELHH",
            {"settlementDateFrom": day.isoformat(), "settlementDateTo": day.isoformat(), "fuelType": "WIND"},
        )
        day += timedelta(days=1)
    return rows


def fetch_forecasts(publish_from: datetime, publish_to: datetime) -> list[dict]:
    """Raw WINDFOR rows published in [publish_from, publish_to), one call per day."""
    rows = []
    start = publish_from
    while start < publish_to:
        end = min(start + timedelta(days=1), publish_to)
        rows += _get_stream(
            "WINDFOR",
            {
                "publishDateTimeFrom": format_ts(start),
                "publishDateTimeTo": format_ts(end - timedelta(seconds=1)),
            },
        )
        start = end
    return rows


def clean_actuals(rows: list[dict], slot_from: datetime, slot_to: datetime) -> dict[datetime, int]:
    """Generation per half-hour slot in [slot_from, slot_to), keeping the latest published value."""
    latest: dict[datetime, dict] = {}
    for r in rows:
        if r.get("fuelType") != "WIND" or r.get("generation") is None:
            continue
        slot = parse_ts(r["startTime"])
        if not slot_from <= slot < slot_to:
            continue
        if slot not in latest or r["publishTime"] > latest[slot]["publishTime"]:
            latest[slot] = r
    return {slot: r["generation"] for slot, r in sorted(latest.items())}


def clean_forecasts(
    rows: list[dict], slot_from: datetime, slot_to: datetime
) -> dict[datetime, list[tuple[datetime, int]]]:
    """(publishTime, generation) pairs per hourly slot in [slot_from, slot_to), oldest first.

    Rows published after their slot started are backfill, not forecasts, and are dropped.
    """
    by_slot: dict[datetime, dict[datetime, int]] = {}
    for r in rows:
        if r.get("generation") is None:
            continue
        slot, published = parse_ts(r["startTime"]), parse_ts(r["publishTime"])
        if not slot_from <= slot < slot_to or published > slot:
            continue
        by_slot.setdefault(slot, {})[published] = r["generation"]
    return {slot: sorted(pubs.items()) for slot, pubs in sorted(by_slot.items())}
