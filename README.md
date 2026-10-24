# Windsight: UK wind forecast accuracy for day-ahead buying

A web app for a UK energy utility's day-ahead trading team. For January 2026 it shows:

1. **The latest wind forecast that was available when the buying decision had to be made**, next to what the wind farms actually produced.
2. **How accurate that forecast was**, in numbers the team can plan around (average error, bias, error %, big-miss error), and how the error changes with the hour of day and with how far ahead the decision is made.

**Live app:** https://wvtrk.vercel.app  ·  **API docs:** https://wvtrk.vercel.app/docs

Built with React + TypeScript (front end), Python + FastAPI (back end), Docker, and deployed on Vercel. Data comes only from Elexon's national wind datasets, as the brief requires.

---

## Key findings (January 2026)

- With a forecast made at least 24 hours ahead, the average miss was **2,050 MW**, about **18% of average wind output**.
- Forecasts ran **high on 30 of 31 days**, by about **1.9 GW on average**, most of all **overnight** (about 2.4 GW between 02:00 and 06:00).
- Error grows with how far ahead the decision is made: from about 1.8 GW at 0 h to 2.4 GW at 48 h.
- The over-forecast is largest when wind is strongest, which suggests wind farms being curtailed (told to turn down) when the grid is full. A steady gap at low wind also points to the two datasets covering slightly different wind farms. Both are likely causes, not confirmed ones.

Full analysis: [plans/data-notes.md](plans/data-notes.md).

---

## How to start the application

### Option 1: Docker (recommended)

Needs Docker Desktop running.

```bash
docker compose up --build
```

- Dashboard: http://localhost:8080
- API docs: http://localhost:8080/docs

Stop with `Ctrl+C`, then `docker compose down`.

### Option 2: Run without Docker

Needs Python 3.12+ and Node 22+. From the repo root:

```bash
# Back end (http://localhost:8000)
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/uvicorn app.main:app --app-dir backend --reload
```

```bash
# Front end (http://localhost:5173), in a second terminal
cd frontend
npm ci
npm run dev
```

The Vite dev server forwards `/api` to the back end on port 8000.

### Tests

```bash
(cd backend && ../.venv/bin/python -m pytest)   # 35 tests: matching, metrics, API
(cd frontend && npm test)                       # 10 tests: histogram, insights, missing hours, formatting
```

Back-end tests can also run on Python 3.12 inside Docker:

```bash
docker build --target test -t windsight-api-test backend && docker run --rm windsight-api-test
```

### Refreshing the data (optional)

The app ships with a data snapshot, so it never calls Elexon while running. To download it again:

```bash
cd backend && ../.venv/bin/python -m scripts.build_snapshot
```

---

## How it works

```
Elexon API ──(build_snapshot.py, run once)──► backend/data/snapshot.json
                                                     │
browser ── /            ──► React app (static files) │
        └─ /api/...     ──► FastAPI ◄────────────────┘ loaded into memory at startup
```

**Data.** Actual output comes from Elexon `FUELHH` (filtered to `fuelType = WIND`, every 30 minutes). Forecasts come from Elexon `WINDFOR` (hourly, published 8 times a day). Forecasts are fetched by publish time from 29 December 2025, because forecasts for early January were published in late December.

**Choosing the forecast a trader would have had.** For each hour, the app uses the **latest forecast published at or before a cutoff**. Two ways of setting the cutoff:

- **Hours ahead** (slider, 0–48 h, default 24 h): the cutoff is H hours before the hour being delivered.
- **Day before** (a decision time, default 09:00): the cutoff is that time on the day before delivery, which is how a day-ahead purchase actually works.

**Accuracy.** For every matched hour, error = forecast − actual. The app reports:

| Metric | Shown as | Meaning |
|---|---|---|
| MAE | Average error | Typical size of a miss, ignoring direction |
| Bias | Bias | Average of forecast − actual. Positive means the forecast was too high |
| NMAE | Error % | Average error as a % of average wind output |
| RMSE | Big-miss error | Like MAE, but large misses count more |

It also shows the error for each hour of the day, the spread of errors (in 0.5 GW steps), and how many hours had a forecast. MAPE is not used because it breaks down when wind output is close to zero.

**Assumptions** (details in [plans/data-notes.md](plans/data-notes.md)):

- Forecasts are hourly, so only on-the-hour actuals are compared (744 hours in January). Averaging the half-hourly actuals made less than 1% difference.
- Times are UK time, which is the same as UTC in January.
- "Purchase decisions in January 2026" is read as **delivery in January 2026** (1–31 January), so the day-ahead decisions covered are those made from 31 December to 30 January.
- The day-before decision time defaults to 09:00 UK time; any time can be chosen.
- Beyond 42 hours ahead, some night hours have no forecast. The app shows how many hours were compared and warns when some are missing.

### API

All data endpoints take `start` and `end` (dates in January 2026), `mode` (`horizon` or `day_ahead`), `horizon` (0–48) and `cutoff` (`HH:MM`, day-ahead mode). Invalid input returns a clear 400 or 422 error.

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Status, when the data was fetched, and the period covered |
| `GET /api/generation` | Each hour's actual, forecast, publish time and error, plus half-hourly actuals |
| `GET /api/metrics` | MAE, RMSE, bias, NMAE, mean actual, and hours used out of the total |
| `GET /api/error-profile` | Mean error and MAE for each hour of the day |

---

## Files and directories

```
wvtrk/
├── README.md
├── CLAUDE.md                   # Working rules used with the AI coding assistant
├── plans/
│   ├── requirements.md         # Requirements taken from the brief, with assumptions marked
│   ├── plan.md                 # Build plan, phases, decisions and done checklist
│   └── data-notes.md           # Phase 1 data exploration: findings, open questions, decisions
├── backend/                    # Python + FastAPI
│   ├── app/
│   │   ├── main.py             # API routes, query validation, response models
│   │   ├── elexon.py           # Fetch and clean FUELHH (WIND) and WINDFOR data
│   │   ├── data.py             # Snapshot format and in-memory loader
│   │   ├── forecast.py         # Pick the latest forecast before a cutoff (both modes)
│   │   └── metrics.py          # MAE, RMSE, bias, NMAE, error by hour
│   ├── data/snapshot.json      # January 2026 actuals and forecasts (about 0.5 MB)
│   ├── scripts/
│   │   ├── build_snapshot.py   # Downloads from Elexon and writes the snapshot
│   │   └── explore_data.py     # Phase 1 data quality and coverage report
│   ├── tests/                  # pytest: matching, metrics, API
│   ├── requirements.txt        # Runtime packages (requirements-dev.txt adds test tools)
│   └── Dockerfile              # Targets: test, runtime
├── frontend/                   # React + TypeScript (Vite)
│   ├── src/
│   │   ├── App.tsx             # Page layout and state
│   │   ├── api.ts, types.ts    # API client and response types
│   │   ├── components/         # Sidebar, settings, cards, charts (custom SVG), insights
│   │   ├── hooks/              # Data loading, animations, layout helpers
│   │   ├── lib/                # Formatting and analysis helpers, with unit tests
│   │   └── styles/global.css   # Colours, fonts, base styles
│   ├── Dockerfile              # Builds the app, serves it with nginx
│   └── nginx.conf.template     # Serves the app and forwards /api to the back end
├── docker-compose.yml          # api (:8000) + web (:8080)
├── api/index.py                # Vercel entry point for the FastAPI app
├── vercel.json                 # Vercel build, routing and function settings
├── requirements.txt            # Python packages for Vercel (same versions as backend/)
└── .python-version             # Python 3.12 for Vercel
```

---

## Deployment

The app is deployed on Vercel from the `main` branch: the React app is served as static files and FastAPI runs as a Python function, on one address. `vercel.json` builds the front end from `frontend/`, sends `/api/*`, `/docs` and `/openapi.json` to `api/index.py`, and bundles the data snapshot with the function. Every push to `main` redeploys.

---

## Use of AI tools

As the brief allows, I used **Claude Code (Claude Opus 5.5)**, Anthropic's AI coding assistant, for:

- exploring the Elexon data,
- writing the code,
- writing this README.
