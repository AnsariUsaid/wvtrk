"""REST API for January 2026 UK wind forecasts vs actual generation.

Run from backend/:
    uvicorn app.main:app --reload
"""

import os
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from enum import Enum
from typing import Annotated, NamedTuple

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.data import PERIOD_END, PERIOD_START, Snapshot, load_snapshot
from app.forecast import (
    DEFAULT_DAY_AHEAD_CUTOFF,
    DEFAULT_HORIZON_H,
    MAX_HORIZON_H,
    MIN_HORIZON_H,
    MatchResult,
    day_ahead_cutoff,
    horizon_cutoff,
    match,
    slot_range,
)
from app.metrics import error_by_hour, summarise

FIRST_DAY = PERIOD_START.date()
LAST_DAY = (PERIOD_END - timedelta(days=1)).date()


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_snapshot()  # fail fast if the snapshot is missing, and keep it in memory
    yield


app = FastAPI(
    title="UK Wind Forecast Accuracy API",
    description="Elexon national wind forecasts (WINDFOR) compared with actual generation (FUELHH), January 2026.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET"],
)


# ---------- Response models (camelCase in JSON) ----------


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Mode(str, Enum):
    horizon = "horizon"
    day_ahead = "day_ahead"


class Selection(ApiModel):
    start: date
    end: date
    mode: Mode
    horizon: float | None
    cutoff: time | None


class Coverage(ApiModel):
    slots_used: int
    slots_total: int
    partial_coverage: bool


class Slot(ApiModel):
    start_time: datetime
    actual: int
    forecast: int | None
    publish_time: datetime | None
    error: int | None


class ActualPoint(ApiModel):
    start_time: datetime
    generation: int


class GenerationResponse(ApiModel):
    selection: Selection
    coverage: Coverage
    slots: list[Slot]  # hourly, forecast is null where no forecast was available
    actuals: list[ActualPoint]  # half-hourly


class MetricsResponse(ApiModel):
    selection: Selection
    coverage: Coverage
    mae: float | None
    rmse: float | None
    bias: float | None
    nmae: float | None
    mean_actual: float | None


class HourRow(ApiModel):
    hour: int
    slots: int
    mean_error: float
    mae: float


class ErrorProfileResponse(ApiModel):
    selection: Selection
    coverage: Coverage
    hours: list[HourRow]


class HealthResponse(ApiModel):
    status: str
    fetched_at: str
    period_start: date
    period_end: date


# ---------- Shared query handling ----------


def get_snapshot() -> Snapshot:
    return load_snapshot()


def get_selection(
    start: Annotated[date, Query(description="First delivery date")] = FIRST_DAY,
    end: Annotated[date, Query(description="Last delivery date (inclusive)")] = LAST_DAY,
    mode: Annotated[Mode, Query(description="How the forecast cutoff is set")] = Mode.horizon,
    horizon: Annotated[
        float, Query(ge=MIN_HORIZON_H, le=MAX_HORIZON_H, description="Hours before the slot (horizon mode)")
    ] = DEFAULT_HORIZON_H,
    cutoff: Annotated[time, Query(description="Decision time on the day before delivery (day_ahead mode)")] = (
        DEFAULT_DAY_AHEAD_CUTOFF
    ),
) -> Selection:
    if mode is Mode.horizon:
        return Selection(start=start, end=end, mode=mode, horizon=horizon, cutoff=None)
    return Selection(start=start, end=end, mode=mode, horizon=None, cutoff=cutoff.replace(tzinfo=None))


class Matched(NamedTuple):
    selection: Selection
    result: MatchResult


def get_match(
    selection: Annotated[Selection, Depends(get_selection)],
    snapshot: Annotated[Snapshot, Depends(get_snapshot)],
) -> Matched:
    cutoff = horizon_cutoff(selection.horizon) if selection.mode is Mode.horizon else day_ahead_cutoff(selection.cutoff)
    try:
        return Matched(selection, match(snapshot, selection.start, selection.end, cutoff))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def coverage(result: MatchResult) -> Coverage:
    used = len(result.slots)
    return Coverage(slots_used=used, slots_total=result.total, partial_coverage=used < result.total)


def round1(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


# ---------- Routes ----------


@app.get("/api/health", response_model=HealthResponse)
def health(snapshot: Annotated[Snapshot, Depends(get_snapshot)]):
    return HealthResponse(status="ok", fetched_at=snapshot.fetched_at, period_start=FIRST_DAY, period_end=LAST_DAY)


@app.get("/api/generation", response_model=GenerationResponse)
def generation(
    matched: Annotated[Matched, Depends(get_match)],
    snapshot: Annotated[Snapshot, Depends(get_snapshot)],
):
    selection, result = matched
    slots = [
        Slot(start_time=s.start_time, actual=s.actual, forecast=s.forecast, publish_time=s.publish_time, error=s.error)
        for s in result.slots
    ]
    slots += [
        Slot(start_time=t, actual=snapshot.actuals[t], forecast=None, publish_time=None, error=None)
        for t in result.unmatched
    ]
    slots.sort(key=lambda s: s.start_time)

    slot_from, slot_to = slot_range(selection.start, selection.end)
    actuals = [ActualPoint(start_time=t, generation=g) for t, g in snapshot.actuals.items() if slot_from <= t < slot_to]
    return GenerationResponse(selection=selection, coverage=coverage(result), slots=slots, actuals=actuals)


@app.get("/api/metrics", response_model=MetricsResponse)
def metrics(matched: Annotated[Matched, Depends(get_match)]):
    selection, result = matched
    s = summarise(result)
    return MetricsResponse(
        selection=selection,
        coverage=coverage(result),
        mae=round1(s.mae),
        rmse=round1(s.rmse),
        bias=round1(s.bias),
        nmae=round1(s.nmae),
        mean_actual=round1(s.mean_actual),
    )


@app.get("/api/error-profile", response_model=ErrorProfileResponse)
def error_profile(matched: Annotated[Matched, Depends(get_match)]):
    selection, result = matched
    hours = [
        HourRow(hour=h.hour, slots=h.slots, mean_error=round(h.mean_error, 1), mae=round(h.mae, 1))
        for h in error_by_hour(result)
    ]
    return ErrorProfileResponse(selection=selection, coverage=coverage(result), hours=hours)
