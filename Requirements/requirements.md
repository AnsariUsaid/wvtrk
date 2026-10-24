# Requirements

Source: Product manager brief (Full Stack SWE challenge).
Items marked *(assumed)* are my reading of the brief and are not stated in it directly.

---

> ## ⭐ Main Requirements
>
> 1. **Show the latest wind forecast** that was available when the day-ahead buying decision had to be made.
> 2. **Measure forecast accuracy** by comparing forecasts with actual generation, with clear error numbers.
> 3. **Use only Elexon national wind data**: actuals from `FUELHH` (fuelType = WIND), forecasts from `WINDFOR`.
> 4. **Limit the scope to January 2026** purchase decisions.
> 5. **Tech stack:** React front end, Python back end, Docker.
> 6. **Deploy it** on Vercel or Heroku and share a public GitHub repo with a README.
> 7. **Submit a demo video** (max 10 min): a client pitch plus a tech-lead walkthrough.

---

## Functional Requirements

**Data**
- FR-1: Fetch actual wind generation from the Elexon `FUELHH` stream API, keeping only `fuelType = "WIND"`.
- FR-2: Use `startTime` (30-minute slots) and `generation` from the actuals data.
- FR-3: Fetch wind forecasts from the Elexon `WINDFOR` stream API.
- FR-4: Use `startTime`, `publishTime` and `generation` from the forecast data.
- FR-5: Only load data relevant to purchase decisions in January 2026.

**Latest forecast view**
- FR-6: For each target time, pick the latest forecast published before the day-ahead decision point *(decision cutoff assumed, e.g. the day before delivery)*.
- FR-7: Show actual and forecast generation side by side on a time-series chart.
- FR-8: Let the user choose a date or time range within January 2026 *(assumed)*.
- FR-9: Let the user change the forecast horizon, i.e. how long before the target time the forecast was published *(assumed)*.

**Accuracy evaluation**
- FR-10: Calculate the forecast error (forecast − actual) for each matched 30-minute slot.
- FR-11: Show summary error metrics such as MAE, RMSE, bias and percentage error *(exact metrics assumed)*.
- FR-12: Show how the error is spread, e.g. a histogram or error-by-time-of-day *(assumed)*.

**Delivery**
- FR-13: Provide a public GitHub repo with an anonymous name (e.g. `kjhwr`).
- FR-14: Include a README with the files and folders, how to start the app, the live app link, and a note on AI tool use.
- FR-15: Record an unlisted YouTube video: Part 1 is the client pitch (≤5 min) and Part 2 is the tech-lead review (≤5 min).
- FR-16: Submit all links through the given Microsoft form.

---

## Non-Functional Requirements

**Technology**
- NFR-1: Front end built in React.
- NFR-2: Back end built in Python.
- NFR-3: Application runs in Docker.
- NFR-4: Deployed on Vercel or Heroku.

**Usability**
- NFR-5: The UI is clear enough for a non-technical energy trading team to use *(assumed)*.
- NFR-6: Charts and numbers are easy to read and help the user make buying decisions.

**Performance and reliability**
- NFR-7: Pages and charts load quickly, e.g. by caching Elexon data instead of fetching it on every request *(assumed)*.
- NFR-8: Missing data or failed API calls are handled cleanly without crashing *(assumed)*.

**Code quality and maintainability**
- NFR-9: The code is clean and well structured so that a tech lead can review it easily.
- NFR-10: The architecture and design are documented for knowledge transfer.

**Access and constraints**
- NFR-11: The repo, live app and video can all be opened without logging in (check each in incognito mode).
- NFR-12: Total effort stays within 16 hours.
- NFR-13: The demo video is no longer than 10 minutes in total.
