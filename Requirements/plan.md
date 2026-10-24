# Build Plan

Based on [requirements.md](requirements.md).

---

> ## ⭐ Goal in one line
> A web app that shows the UK wind forecast a trader would have had at decision time for January 2026, and how wrong that forecast turned out to be.

---

## 1. Tech choices (keep it simple)

| Part | Choice | Why |
|---|---|---|
| Front end | React (Vite) + Recharts | Fast setup, simple charts |
| Back end | Python + FastAPI | Light, quick to build, auto API docs |
| Data | Elexon `FUELHH` (WIND) + `WINDFOR` | Only data allowed by the brief |
| Storage | Small JSON snapshot (fetched once by a script, shipped with the app, loaded at startup) | The data is historical, so no database is needed, and serverless cold starts don't have to call Elexon again |
| Local run | Docker + docker-compose | Required by the brief |
| Deploy | Vercel: React as a static site, FastAPI as a Python function | Free and simple. Heroku with a Docker image is the backup option |

---

## 2. How it works

```
Elexon API  ──►  Python backend (fetch → clean → match → metrics)  ──►  REST API  ──►  React UI (charts + numbers)
```

**Core logic, the key idea:**
1. Get actual wind generation for every 30-minute slot in January 2026.
2. Get every wind forecast that covers those slots, along with its `publishTime`. Fetch by `publishTime` from 29 Dec 2025, because forecasts for early January were published in late December 2025. `WINDFOR` is hourly, so only the on-the-hour slots are compared (744 slots).
3. For each slot, pick the **latest forecast published at least *H* hours before the slot**. *H* is the forecast horizon: the slider runs from 0 to 48h, with a default of 24h to match the day-ahead decision. The slider is a simplification: the real purchase is made once, on the day before delivery, so the true horizon varies through the day *(assumed)*. See [data-notes.md](data-notes.md) for why.
4. Compare that forecast with the actual value to get the error, then summarise it as MAE, RMSE, bias and normalised MAE (MAE as % of mean actual). MAPE is avoided because it blows up when wind output is near zero.

---

## 3. Backend API

All data endpoints take `start` and `end` (dates in January 2026, default the whole month), `mode` (`horizon` or `day_ahead`), `horizon` (0–48h, default 24) and `cutoff` (time on D-1 in day-ahead mode, default `09:00`). Every response repeats the `selection` and gives `coverage` (slots used, total slots, `partialCoverage`). Interactive docs are at `/docs`.

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Status, snapshot fetch time and the period covered |
| `GET /api/generation` | Hourly `slots` (`startTime`, `actual`, `forecast`, `publishTime`, `error`; forecast is null when there isn't one), plus half-hourly `actuals` |
| `GET /api/metrics` | MAE, RMSE, bias, normalised MAE and mean actual |
| `GET /api/error-profile` | Mean error and MAE for each hour of the day |

---

## 4. Front-end screens

One page, three parts:
1. **Controls:** date range (January 2026 only) and a horizon slider (0–48h, default 24h).
2. **Main chart:** actual vs forecast wind over time on a line chart.
3. **Accuracy panel:** cards for MAE, RMSE and bias, plus an error-by-hour or histogram chart.

---

## 5. Folder layout

```
wvtrk/
├── Requirements/          # requirements.md, plan.md, data-notes.md
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app + routes
│   │   ├── elexon.py      # fetch and clean data from Elexon
│   │   ├── data.py        # snapshot format + loader
│   │   ├── forecast.py    # pick latest forecast per slot (horizon or day-ahead cutoff)
│   │   └── metrics.py     # error calculations
│   ├── data/snapshot.json # January 2026 data, built by scripts/build_snapshot.py
│   ├── scripts/           # build_snapshot.py, explore_data.py (Phase 1)
│   ├── tests/             # pytest: matching, metrics, API
│   ├── requirements.txt   # requirements-dev.txt adds pytest
│   └── Dockerfile
├── frontend/
│   ├── src/ (components, api client, charts)
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── vercel.json
└── README.md
```

---

## 6. Phases

**Phase 1: Data check** ✅ Done 2026-10-24, findings in [data-notes.md](data-notes.md)
Goal: Confirm the Elexon data for January 2026 is usable.
- [x] Explore the `FUELHH` (WIND) and `WINDFOR` APIs with a script (`backend/scripts/explore_data.py`)
- [x] Check the January 2026 actuals and the forecasts published from late December 2025
- [x] Check the WINDFOR resolution: it is hourly, so only on-the-hour slots are compared

Done when: both datasets load for January 2026 and the slot-matching approach is decided.

**Phase 2: Backend data and logic** ✅ Done 2026-10-24
Goal: Turn the raw data into matched forecasts and error metrics.
- [x] Fetch, clean and save the data as a JSON snapshot (forecasts from late December 2025), 491 KB
- [x] Pick the latest forecast published at least *H* hours before each slot, or by a fixed time on D-1 (day-ahead mode, see data-notes.md D6)
- [x] Calculate MAE, RMSE, bias and normalised MAE, skipping unmatched slots and counting the slots used
- [x] Results match the Phase 1 numbers (e.g. H = 24: 744 slots, MAE 2,050 MW)

Done when: the snapshot exists and, for a given horizon, the code returns matched slots and metrics from it.

**Phase 3: Backend API** ✅ Done 2026-10-24
Goal: Serve the data and metrics over REST.
- [x] Add `/api/health`, `/api/generation`, `/api/metrics` and `/api/error-profile` (both cutoff modes)
- [x] Return how many slots were used with the metrics
- [x] Write unit tests for forecast matching and metrics, plus API tests (35 passing)

Done when: all endpoints return correct JSON and the tests pass.

**Phase 4: Front end**
Goal: Build the single page the trading team will use.
- Layout, controls (date range, horizon slider) and API client
- Main chart of actual vs forecast
- Accuracy panel with metric cards and an error-by-hour or histogram chart

Done when: moving the slider changes the chart and the metrics update with it.

**Phase 5: Docker**
Goal: Run the whole app locally with one command.
- Dockerfiles for the backend and front end, plus `docker-compose.yml`
- Use a Vite proxy or CORS, since the front end and back end run on different ports

Done when: `docker-compose up` runs the app locally.

**Phase 6: Deploy**
Goal: Put the app live.
- Deploy to Vercel, falling back to Heroku with Docker if Vercel's Python limits get in the way
- Test the live app

Done when: the live link works in incognito.

**Phase 7: Docs and submission**
Goal: Hand over everything the brief asks for.
- Write the README (files, how to run, live link, AI use note)
- Record the video: client pitch and tech-lead review, up to 5 min each
- Submit all links in the form

Done when: every item in the Done checklist (section 7) is ticked.

---

## 7. Done checklist

- [ ] Live app shows actual vs forecast for January 2026
- [ ] Horizon slider changes which forecast is used, and the metrics update with it
- [ ] Error metrics are shown clearly
- [ ] `docker-compose up` runs the app locally
- [ ] Deployed on Vercel (or Heroku) and opens in incognito
- [ ] Public GitHub repo with an anonymous name and a full README (AI tool use mentioned)
- [ ] Unlisted YouTube video of 10 min or less, with both parts
- [ ] All links submitted in the form

---

## 8. Risks

- **Elexon API is slow or limits requests:** fetch in daily chunks and cache the results.
- **WINDFOR is hourly but actuals are half-hourly:** resolved by comparing on-the-hour slots only (see data-notes.md, D1).
- **Missing slots in the actuals or forecasts:** skip unmatched slots and show how many were used.
- **Vercel's Python function limits:** keep the data small, or move to Heroku with Docker.
