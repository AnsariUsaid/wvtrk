"""Phase 1 data check: load January 2026 wind actuals and forecasts from Elexon
and print a quality / coverage report.

Run from the repo root:
    python backend/scripts/explore_data.py           # uses cached raw data if present
    python backend/scripts/explore_data.py --refresh # re-download from Elexon
"""

import argparse
import json
import statistics
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

JAN_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
JAN_END = datetime(2026, 2, 1, tzinfo=timezone.utc)  # exclusive
# Forecasts for early January are published in late December.
FORECAST_PUBLISH_FROM = JAN_START - timedelta(days=3)

HORIZONS_H = [0, 1, 2, 4, 6, 8, 12, 18, 24, 30, 36, 42, 48, 60, 72]


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def get_json(dataset: str, params: dict) -> list[dict]:
    resp = requests.get(f"{BASE_URL}/{dataset}/stream", params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def fetch_actuals() -> list[dict]:
    # January is GMT, so settlement dates line up with UTC days.
    rows = []
    day = JAN_START.date()
    while day < JAN_END.date():
        rows += get_json(
            "FUELHH",
            {"settlementDateFrom": day.isoformat(), "settlementDateTo": day.isoformat(), "fuelType": "WIND"},
        )
        day += timedelta(days=1)
    return rows


def fetch_forecasts() -> list[dict]:
    rows = []
    start = FORECAST_PUBLISH_FROM
    while start < JAN_END:
        end = start + timedelta(days=1)
        rows += get_json(
            "WINDFOR",
            {
                "publishDateTimeFrom": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": (end - timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        start = end
    return rows


def load(name: str, fetch, refresh: bool) -> list[dict]:
    path = RAW_DIR / f"{name}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    print(f"Downloading {name} from Elexon...")
    rows = fetch()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows))
    return rows


def summarise(values: list[float]) -> str:
    return (
        f"min {min(values):,.0f}  mean {statistics.mean(values):,.0f}  "
        f"median {statistics.median(values):,.0f}  max {max(values):,.0f}"
    )


def report_actuals(rows: list[dict]) -> dict[datetime, float]:
    print("\n=== ACTUALS (FUELHH, WIND) ===")
    print(f"records: {len(rows)}")
    print(f"fuel types: {Counter(r['fuelType'] for r in rows)}")

    by_slot = defaultdict(list)
    for r in rows:
        by_slot[parse_ts(r["startTime"])].append(r)
    in_jan = {t: v for t, v in by_slot.items() if JAN_START <= t < JAN_END}
    outside = len(by_slot) - len(in_jan)

    expected = [JAN_START + timedelta(minutes=30 * i) for i in range(31 * 48)]
    missing = [t for t in expected if t not in in_jan]
    dupes = {t: v for t, v in in_jan.items() if len(v) > 1}
    minutes = Counter(t.minute for t in in_jan)

    print(f"distinct January slots: {len(in_jan)} / {len(expected)} expected  (outside Jan: {outside})")
    print(f"slot minutes: {dict(minutes)}")
    print(f"missing slots: {len(missing)} {missing[:5]}")
    print(f"slots with >1 record: {len(dupes)}")
    for t, v in list(dupes.items())[:3]:
        print(f"  {t}: {[(x['publishTime'], x['generation']) for x in v]}")

    # Keep the most recently published value per slot.
    actuals = {t: max(v, key=lambda x: x["publishTime"])["generation"] for t, v in in_jan.items()}
    gen = list(actuals.values())
    print(f"generation MW: {summarise(gen)}")
    print(f"zero/negative slots: {sum(1 for g in gen if g <= 0)}")
    return actuals


def report_forecasts(rows: list[dict]) -> dict[datetime, list[tuple[datetime, float]]]:
    print("\n=== FORECASTS (WINDFOR) ===")
    print(f"records: {len(rows)}")

    pubs = sorted({parse_ts(r["publishTime"]) for r in rows})
    print(f"distinct publishTimes: {len(pubs)}  ({pubs[0]} -> {pubs[-1]})")
    per_day = Counter(p.date() for p in pubs)
    print(f"publishes per day: min {min(per_day.values())}  max {max(per_day.values())}  "
          f"typical {Counter(per_day.values()).most_common(3)}")
    print(f"publish times of day (UTC): {sorted(Counter(p.strftime('%H:%M') for p in pubs).items())}")
    gaps = [(b - a) for a, b in zip(pubs, pubs[1:])]
    big_gaps = [(a, b - a) for a, b in zip(pubs, pubs[1:]) if b - a > timedelta(hours=4)]
    print(f"gap between publishes: {Counter(gaps).most_common(4)}")
    print(f"gaps > 4h: {big_gaps[:10]}")

    starts = [parse_ts(r["startTime"]) for r in rows]
    print(f"startTime minutes: {dict(Counter(t.minute for t in starts))}")

    lead_h = [(parse_ts(r["startTime"]) - parse_ts(r["publishTime"])).total_seconds() / 3600 for r in rows]
    print(f"lead time (startTime - publishTime) h: {summarise(lead_h)}")

    per_pub = defaultdict(list)
    for r in rows:
        per_pub[r["publishTime"]].append(parse_ts(r["startTime"]))
    spans = Counter((min(v) - parse_ts(p), max(v) - parse_ts(p)) for p, v in per_pub.items())
    print("per-publish lead span (first, last): "
          + ", ".join(f"[{a.total_seconds()/3600:+.1f}h, {b.total_seconds()/3600:+.1f}h] x{n}"
                      for (a, b), n in spans.most_common(4)))

    pair_counts = Counter((r["publishTime"], r["startTime"]) for r in rows)
    print(f"duplicate (publishTime, startTime) pairs: {sum(1 for c in pair_counts.values() if c > 1)}")
    print(f"generation MW: {summarise([r['generation'] for r in rows])}")

    by_slot = defaultdict(list)
    for r in rows:
        by_slot[parse_ts(r["startTime"])].append((parse_ts(r["publishTime"]), r["generation"]))
    return by_slot


def latest_forecast(options: list[tuple[datetime, float]], cutoff: datetime):
    eligible = [o for o in options if o[0] <= cutoff]
    return max(eligible, key=lambda o: o[0]) if eligible else None


def report_coverage(actuals: dict, forecasts: dict) -> None:
    print("\n=== MATCHING: latest forecast published >= H hours before slot ===")
    hourly_slots = [t for t in actuals if t.minute == 0]
    print(f"January actual slots on the hour: {len(hourly_slots)}; on :30: {len(actuals) - len(hourly_slots)}")
    print(f"{'H':>4} {'matched':>8} {'mean age h':>11} {'MAE MW':>8} {'bias MW':>8} {'nMAE %':>7}")
    mean_actual = statistics.mean(actuals[t] for t in hourly_slots)
    for h in HORIZONS_H:
        errors, ages = [], []
        for t in hourly_slots:
            pick = latest_forecast(forecasts.get(t, []), t - timedelta(hours=h))
            if pick:
                errors.append(pick[1] - actuals[t])
                ages.append((t - pick[0]).total_seconds() / 3600)
        if not errors:
            print(f"{h:>4} {0:>8}")
            continue
        mae = statistics.mean(abs(e) for e in errors)
        print(f"{h:>4} {len(errors):>8} {statistics.mean(ages):>11.1f} {mae:>8.0f} "
              f"{statistics.mean(errors):>8.0f} {100 * mae / mean_actual:>7.1f}")

    print("\n=== DAY-AHEAD: latest forecast published by a fixed time on D-1 (UTC) ===")
    print(f"{'cutoff':>7} {'matched':>8} {'age min h':>10} {'age max h':>10} {'MAE MW':>8}")
    for cutoff_hour in [9, 11, 12, 17]:
        errors, ages = [], []
        for t in hourly_slots:
            cutoff = datetime.combine(t.date() - timedelta(days=1), datetime.min.time(), timezone.utc) \
                + timedelta(hours=cutoff_hour)
            pick = latest_forecast(forecasts.get(t, []), cutoff)
            if pick:
                errors.append(pick[1] - actuals[t])
                ages.append((t - pick[0]).total_seconds() / 3600)
        if errors:
            print(f"{cutoff_hour:>5}:00 {len(errors):>8} {min(ages):>10.1f} {max(ages):>10.1f} "
                  f"{statistics.mean(abs(e) for e in errors):>8.0f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="re-download raw data from Elexon")
    args = parser.parse_args()

    actuals = report_actuals(load("fuelhh_wind_jan2026", fetch_actuals, args.refresh))
    forecasts = report_forecasts(load("windfor_jan2026", fetch_forecasts, args.refresh))
    report_coverage(actuals, forecasts)


if __name__ == "__main__":
    main()
