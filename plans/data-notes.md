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

## Open questions answered

**Q1. Should we use a fixed purchase cutoff or an adjustable horizon?**
The brief's wording ("the latest forecast available when the day-ahead decision had to be made") suggests a fixed cutoff. The adjustable horizon was our own assumption. The backend supports **both modes**, and the only difference between them is the publish cutoff:
- **Horizon mode:** the cutoff is the slot time minus H.
- **Day-ahead mode:** the cutoff is a fixed time on the day before delivery (D-1).

Which mode the UI shows first is decided in Phase 4. The day-ahead cutoff time is a parameter, with a default of **09:00 UK** *(assumed, before the morning day-ahead auctions; to be confirmed)*. In January, UK time is the same as UTC.

**Q2. Should hourly forecasts be compared with the start-of-hour actual or an hourly average?**
Use the **start-of-hour actual**. The alignment check above shows a difference of under 1%. It is also the simplest choice to explain, and it needs no assumption about what an hourly forecast value represents.

**Q3. Is the over-forecasting caused by curtailment or by a difference in how the datasets are defined?**
Most likely **both**. The table shows the bias at H = 0, grouped by forecast level:

| Forecast (GW) | Slots | Bias (MW) | Bias % of forecast |
|---|---:|---:|---:|
| 0–12 | 335 | +530 to +700 | 7–21% |
| 12–15 | 86 | +1,016 | 8% |
| 15–18 | 154 | +2,087 | 12% |
| 18–21 | 165 | +3,282 | 17% |
| 21+ | 4 | +7,163 | 34% |

- The bias rises sharply when wind is high. Actual output peaks at 17.8 GW, while forecasts reach 21 GW. This fits **curtailment**, where wind farms are told to turn down because the grid cannot carry all the power.
- A steady bias of about 600 MW remains even when wind is low, and curtailment does not explain that. It points to a **definition difference**, for example `WINDFOR` covering some wind farms that `FUELHH` does not meter.
- Neither cause is proven with this data. In the pitch, call them likely causes.

**Q4. Can metrics at long horizons be compared with short ones when they use fewer slots?**
**Not directly.** The 155 slots with no forecast at H = 48 are always the same hours, **22:00–02:00 on every day**, because of the publishing schedule. Those night hours have the largest bias, so dropping them makes the 48h figures look different for reasons unrelated to forecast skill. Comparing every horizon on the same 589 slots gives a cleaner trend:

| H (h) | MAE, own slots (MW) | MAE, same 589 slots (MW) |
|---:|---:|---:|
| 0 | 1,794 (744 slots) | 1,703 |
| 24 | 2,050 (744 slots) | 2,020 |
| 48 | 2,380 (589 slots) | 2,380 |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Compare **on-the-hour slots only** (744 per month) | `WINDFOR` is hourly, and averaging the actuals to hourly made no meaningful difference |
| D2 | Horizon slider runs from **0 to 48h**, default **24h** | Every slot is covered up to 42h and 79% at 48h, beyond which coverage falls away. 24h matches a day-ahead decision |
| D3 | Pick the **latest forecast with `publishTime ≤ startTime − H`** | This is the plan's core rule. With H ≥ 0 it also drops the backfill rows |
| D4 | Fetch forecasts by `publishTime` from **29 Dec 2025** | The longest lead is 66h, so 3 days before 1 Jan is enough |
| D5 | Metrics: MAE, RMSE, bias and nMAE (MAE as % of mean actual), plus the matched slot count | No zero actuals were found, but MAPE is still avoided as planned |
| D6 | The backend supports **both** horizon mode and day-ahead mode (D-1 cutoff time, default 09:00 UK *assumed*) | The brief may expect a fixed cutoff (Q1). The UI choice is made in Phase 4 |
| D7 | Phase 2 snapshot keeps only forecasts for January slots with a lead time ≥ 0 | Backfill rows are dropped to keep the snapshot small for Vercel. Leads over 48h stay, because H = 48 has to pick from them |
| D8 | Always show the matched slot count, and warn when it is below the full count | Above 42h, the missing slots are the night hours, which skews the comparison (Q4) |
| D9 | Delivery day is the UK calendar day *(assumed)* | In January, UK time is the same as UTC, so no clock-change handling is needed |
