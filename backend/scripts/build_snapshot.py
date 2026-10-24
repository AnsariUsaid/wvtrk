"""Download January 2026 wind actuals and forecasts from Elexon and write
backend/data/snapshot.json.

Run from backend/:
    python -m scripts.build_snapshot
"""

import json
from datetime import datetime, timedelta, timezone

from app import elexon
from app.data import FORECAST_PUBLISH_FROM, PERIOD_END, PERIOD_START, SNAPSHOT_PATH, to_json


def main() -> None:
    print("Fetching actuals (FUELHH)...")
    actual_rows = elexon.fetch_actuals(PERIOD_START.date(), (PERIOD_END - timedelta(days=1)).date())
    print("Fetching forecasts (WINDFOR)...")
    forecast_rows = elexon.fetch_forecasts(FORECAST_PUBLISH_FROM, PERIOD_END)

    actuals = elexon.clean_actuals(actual_rows, PERIOD_START, PERIOD_END)
    forecasts = elexon.clean_forecasts(forecast_rows, PERIOD_START, PERIOD_END)

    expected_slots = int((PERIOD_END - PERIOD_START) / timedelta(minutes=30))
    if len(actuals) != expected_slots:
        print(f"WARNING: {len(actuals)} actual slots, expected {expected_slots}")

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(to_json(datetime.now(timezone.utc), actuals, forecasts), separators=(",", ":")))
    n_forecasts = sum(len(v) for v in forecasts.values())
    print(f"Wrote {SNAPSHOT_PATH}: {len(actuals)} actual slots, {len(forecasts)} forecast slots, "
          f"{n_forecasts} forecasts, {SNAPSHOT_PATH.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
