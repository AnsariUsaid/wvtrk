# Build Plan

Based on [requirements.md](requirements.md).

---

> ## ⭐ Goal in one line
> A web app that shows the UK wind forecast a trader would have had at decision time for January 2026, and how wrong that forecast turned out to be.

---

## 1. Tech choices (keep it simple)

| Part | Choice | Why |
|---|---|---|
| Front end | React + TypeScript (Vite), charts drawn as custom SVG | Matches the agreed design exactly with no chart library |
| Back end | Python + FastAPI | Light, quick to build, auto API docs |
| Data | Elexon `FUELHH` (WIND) + `WINDFOR` | Only data allowed by the brief |
| Storage | Small JSON snapshot (fetched once by a script, shipped with the app, loaded at startup) | The data is historical, so no database is needed, and serverless cold starts don't have to call Elexon again |
| Local run | Docker + docker-compose | Required by the brief |
| Deploy | Vercel: React as a static site, FastAPI as a Python function | Free and simple. Heroku with a Docker image is the backup option |
| Chat assistant | OpenAI `gpt-4o-mini` (set by `OPENAI_MODEL`) with tool calling | Cheap and quick. Tools reuse the dashboard's own code, so answers match the screen; no RAG or vector store needed |

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
| `POST /api/chat` | Body: `messages` (user/assistant turns) and the dashboard's current `settings`. Returns the assistant's `reply`. 503 without `OPENAI_API_KEY`, 429 when rate limited, 502 if OpenAI fails |

---

## 4. Front-end screens

One page ("Windsight"), built from the design the user supplied (kept locally, not in git):
1. **Sidebar:** forecast settings only, no section menu (period presets or custom dates, hours-ahead slider 0–48h or day-before decision time, coverage warning). On screens under 900px the settings move above the content.
2. **Overview:** average error hero card, plus bias, error %, big-miss error and hours compared, with change badges against the previous settings. A summary bar sticks to the top once these scroll away.
3. **Actual vs forecast chart:** half-hourly actuals, hourly forecasts, shaded gap, hover details (including when the forecast was published) and drag to zoom.
4. **Error patterns:** error by hour of day and an error histogram with the share of hours over-forecast.
5. **Insights, glossary and how it works:** plain-English takeaways generated from the current figures.
6. **States:** dimmed cards while loading and an error banner with Retry that keeps the last figures on screen.
7. **Chat assistant:** a round green button in the bottom-right corner. From 1100px wide the chat opens as a full-height column on the right and the dashboard narrows to make room; on smaller screens it opens as a pop-up above the button, with the dashboard dimmed and blurred behind it. Starts with three suggested questions.

---

## 5. Folder layout

```
wvtrk/
├── plans/                # requirements.md, plan.md, data-notes.md
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app + routes
│   │   ├── elexon.py      # fetch and clean data from Elexon
│   │   ├── data.py        # snapshot format + loader
│   │   ├── forecast.py    # pick latest forecast per slot (horizon or day-ahead cutoff)
│   │   ├── metrics.py     # error calculations
│   │   └── chat.py        # chat assistant: OpenAI tool calling over the same data
│   ├── data/snapshot.json # January 2026 data, built by scripts/build_snapshot.py
│   ├── scripts/           # build_snapshot.py, explore_data.py (Phase 1)
│   ├── tests/             # pytest: matching, metrics, API, chat tools
│   ├── requirements.txt   # requirements-dev.txt adds pytest
│   └── Dockerfile         # targets: test, runtime
├── frontend/
│   ├── src/               # App, api.ts, types.ts, components/, hooks/, lib/ (formatting, analysis + tests)
│   ├── package.json
│   └── Dockerfile         # build, then nginx (nginx.conf.template)
├── api/index.py           # Vercel entry point for the FastAPI app
├── docker-compose.yml
├── .env.example           # OPENAI_API_KEY and OPENAI_MODEL (copy to .env, which git ignores)
├── vercel.json            # Vercel build, routing and function settings
├── requirements.txt       # Python packages for Vercel (same versions as backend/)
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

**Phase 4: Front end** ✅ Done 2026-10-24
Goal: Build the single page the trading team will use.
- [x] Layout, controls (date range, horizon slider, day-before time) and API client
- [x] Main chart of actual vs forecast
- [x] Accuracy panel with metric cards, error-by-hour and histogram charts
- [x] Insights, loading and error states; checked in the browser against the real API (desktop and phone widths)

Done when: moving the slider changes the chart and the metrics update with it.

**Phase 5: Docker** ✅ Done 2026-10-24
Goal: Run the whole app locally with one command.
- [x] Backend image: Python 3.12, snapshot baked in, non-root user, health check on `/api/health`; a `test` target runs pytest (35 pass on 3.12)
- [x] Front-end image: Node 22 builds the app, nginx serves it and forwards `/api` and `/docs` to the API, so there is no CORS setup
- [x] `docker-compose.yml` (project name `windsight`): `api` on :8000, `web` on :8080, web waits for the API to be healthy

Done when: `docker-compose up` runs the app locally.

**Phase 6: Deploy** ✅ Done 2026-10-24, live at https://wvtrk.vercel.app
Goal: Put the app live.

Vercel serves the built React page as static files and runs FastAPI as a Python function, on one address. Heroku with the Docker images is the backup (it has no free plan). Vercel's auto-detection can't handle this repo on its own: the React app is in `frontend/` rather than the root, Vercel only runs Python functions from a root `api/` folder, and it only bundles files it sees imported (the snapshot is read from disk). These files fill those gaps:

| File | What it does |
|---|---|
| `api/index.py` | Entry point Vercel runs as a function. Adds `backend/` to the import path and exposes the existing FastAPI `app`; no backend code changes |
| `vercel.json` | Builds the front end (`npm ci` and `npm run build` in `frontend/`, serves `frontend/dist`); rewrites `/api/*`, `/docs` and `/openapi.json` to the function (FastAPI still sees the original path); bundles `backend/app` and `backend/data/snapshot.json` with the function |
| `requirements.txt` (root) | Python packages for the function (FastAPI, requests). Vercel cannot read `-r` includes, so the versions repeat `backend/requirements.txt` and must be kept in sync |
| `.python-version` | Python 3.12, the version tested in Docker |
| `.vercelignore` | Keeps the virtual env, raw downloads, tests, scripts and build output out of uploads |

Steps:
- [x] Add the files above and check locally: the entry point serves the API (24h MAE 2,050 MW, `/docs` 200), the root build commands work, and the root `requirements.txt` resolves
- [x] User reviews the files, then pushes
- [x] User imports the repo on vercel.com (Add New → Project → Import, Root Directory `./`, Application Preset "Other"; ignore Vercel's "Services" suggestion and its "configuration mismatch" warning) and deploys
- [x] Fix: Vercel can't read `-r` includes in `requirements.txt`, so the root file lists the packages directly
- [x] Check the live app logged out: page loads, 2,050 MW at 24h, 48h shows 589/744 with the night-hours warning, day-before 09:00 gives 2,127.5 MW, `/docs` and `/openapi.json` load, bad input returns 422, no console errors
- [x] Record the live URL here

Done when: the live link works in incognito.

**Phase 7: Chat assistant** (branch `feat/chat-assistant`)
Goal: Let the team ask questions about the figures in plain English.

The model never sees the raw data. It calls four tools that reuse `forecast.py` and `metrics.py`: `get_accuracy`, `get_error_by_hour` (with the worst and best hour), `get_daily_summary` (sorted worst day first) and `get_biggest_misses`. Each request also sends the dashboard's current settings, so "this period" means what is on screen.
- [x] `POST /api/chat` with OpenAI tool calling: at most 4 tool rounds, replies capped at 500 tokens, last 12 messages sent, about 20 questions per 10 minutes per visitor (per server instance)
- [x] Fix wrong answers found in testing: the model took the first day in the list as the worst, and once answered without calling a tool. Tools now return rankings, and the first round must call a tool
- [x] Tests with a fake OpenAI client (51 back-end tests pass); 8 real questions checked against the tools
- [x] Chat UI agreed with the user: round green button bottom right; docked column from 1100px, blurred pop-up below that
- [x] `OPENAI_API_KEY` and `OPENAI_MODEL` passed through Docker Compose and the local API (`.env`); Vercel function time limit raised to 30 s
- [ ] Add `OPENAI_API_KEY` in Vercel's project settings (user)
- [ ] Push the branch and merge into `main` (user to approve)

Done when: the chat answers correctly on the live app.

---

## 7. Done checklist

- [x] Live app shows actual vs forecast for January 2026
- [x] Horizon slider changes which forecast is used, and the metrics update with it
- [x] Error metrics are shown clearly
- [x] `docker-compose up` runs the app locally
- [x] Deployed on Vercel (or Heroku) and opens in incognito
- [ ] Public GitHub repo with an anonymous name and a full README (AI tool use mentioned)
- [ ] Unlisted YouTube video of 10 min or less, with both parts
- [ ] All links submitted in the form

---

## 8. Risks

- **Elexon API is slow or limits requests:** fetch in daily chunks and cache the results.
- **WINDFOR is hourly but actuals are half-hourly:** resolved by comparing on-the-hour slots only (see data-notes.md, D1).
- **Missing slots in the actuals or forecasts:** skip unmatched slots and show how many were used.
- **Vercel's Python function limits:** keep the data small, or move to Heroku with Docker.
- **Chat cost and abuse:** the app is public with no login. Replies are capped, there is a per-visitor rate limit, and a monthly spending limit should be set in the OpenAI dashboard.
- **Chat giving wrong numbers:** every figure must come from a tool, and tools return ready-made rankings rather than leaving the model to scan long lists.
