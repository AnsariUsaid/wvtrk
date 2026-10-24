# Data Notes (Phase 1)

Findings from `backend/scripts/explore_data.py`, run on 2026-10-24 against the Elexon Insights API.
Raw downloads are cached in `backend/data/raw/` (git-ignored). Run with `--refresh` to download them again.

---

> ## ⭐ Summary
> - Both datasets load cleanly for January 2026. No gaps and no duplicates.
> - `WINDFOR` is **hourly**, so we compare **on-the-hour slots only** (744 slots).
> - Every slot has a forecast for horizons up to 42h, and 79% of slots have one at 48h, so the **slider runs 0–48h**.
> - Forecasts are about **1.6–1.9 GW higher than actuals** on almost every day. This is the headline finding.

---

## Endpoints used

| Data | Call | Notes |
|---|---|---|
| Actuals | `GET /datasets/FUELHH/stream?settlementDateFrom=D&settlementDateTo=D&fuelType=WIND` | One call per day. January is on GMT, so settlement dates line up with UTC days |
| Forecasts | `GET /datasets/WINDFOR/stream?publishDateTimeFrom=…&publishDateTimeTo=…` | One call per day of `publishTime`, from 29 Dec 2025 to 31 Jan 2026 |

Base URL: `https://data.elexon.co.uk/bmrs/api/v1`. No API key needed. A full download takes about 1 minute.

## Actuals (`FUELHH`, WIND)

- There are 1,488 records, which is exactly 31 × 48 half-hour slots, with no missing or duplicate slots.
- Generation ranges from 1,695 to 17,805 MW, with a mean of 11,581 MW. No slot is zero or negative.

## Forecasts (`WINDFOR`)

- 19,856 records from 272 publishes.
- Forecasts are published **8 times a day** at fixed UTC times: 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30. One publish was at 12:25 instead of 11:30.
- `startTime` is always on the hour, so the data is hourly.
- Each publish covers from about 12–25h in the past (a backfill) to about 46–60h ahead. Rows with `startTime` before `publishTime` are not real forecasts. Requiring a horizon of H ≥ 0 removes them.
- No duplicate (`publishTime`, `startTime`) pairs.

## Matching: latest forecast published ≥ H hours before the slot

The table covers 744 hourly January slots.

| H (h) | Matched | Mean age (h) | MAE (MW) | Bias (MW) | nMAE |
|---:|---:|---:|---:|---:|---:|
| 0 | 744 | 1.6 | 1,794 | +1,592 | 15.5% |
| 4 | 744 | 5.6 | 1,836 | +1,645 | 15.9% |
| 12 | 744 | 13.6 | 1,898 | +1,704 | 16.4% |
| 24 | 744 | 25.6 | 2,050 | +1,854 | 17.7% |
| 36 | 744 | 37.6 | 2,258 | +1,951 | 19.5% |
| 42 | 744 | 43.6 | 2,307 | +1,939 | 19.9% |
| 48 | 589 | 49.4 | 2,380 | +1,879 | 20.5% |
| 60 | 217 | 61.2 | 2,383 | +954 | 20.6% |
| 72 | 0 | – | – | – | – |

As expected, error grows steadily with horizon.

**Slot alignment check (H = 24):** comparing the hourly forecast with the actual at `:00` gives an MAE of 2,050 MW. Comparing with the average of `:00` and `:30` gives 2,064 MW, and with the average of `:30` (previous) and `:00` gives 2,030 MW. The difference is negligible, so we use the simplest option.

**Fixed day-ahead cutoff (the latest forecast published by a set time on D-1):** with a 09:00 UTC cutoff, the forecasts used are 16.5–39.5h old and the MAE is 2,127 MW. With 12:00 the MAE is 2,003 MW, and with 17:00 it is 1,968 MW. Every slot is matched for every cutoff.

## Forecast bias

- At H = 24, the forecast is higher than the actual on **30 of 31 days**. The daily mean bias ranges from −24 to +5,020 MW.
- The bias is largest overnight (about +2.4 GW at 02:00–06:00) and smallest in the afternoon (about +1.4 GW).
- The bias is there even at H = 0, so it does not come from forecasting too far ahead.
- One possible cause *(not verified)* is that `WINDFOR` forecasts available wind output, while `FUELHH` records metered output after wind farms are curtailed. Curtailment is heaviest overnight, when demand is low. We should mention this carefully in the pitch, as a likely cause and not a confirmed one.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Compare **on-the-hour slots only** (744 per month) | `WINDFOR` is hourly, and averaging the actuals to hourly made no meaningful difference |
| D2 | Horizon slider runs from **0 to 48h**, default **24h** | Every slot is covered up to 42h and 79% at 48h, beyond which coverage falls away. 24h matches a day-ahead decision |
| D3 | Pick the **latest forecast with `publishTime ≤ startTime − H`** | This is the plan's core rule. With H ≥ 0 it also drops the backfill rows |
| D4 | Fetch forecasts by `publishTime` from **29 Dec 2025** | The longest lead is 66h, so 3 days before 1 Jan is enough |
| D5 | Metrics: MAE, RMSE, bias and nMAE (MAE as % of mean actual), plus the matched slot count | No zero actuals were found, but MAPE is still avoided as planned |
| D6 | A fixed "D-1 cutoff time" mode is **optional and left for later** | The slider covers what the brief asks for. A cutoff mode can be added if time allows |
| D7 | Phase 2 snapshot keeps only forecasts for January slots with a lead time ≥ 0 | Backfill rows are dropped to keep the snapshot small for Vercel. Leads over 48h stay, because H = 48 has to pick from them |
