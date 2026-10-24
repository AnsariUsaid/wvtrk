"""Forecast error metrics for matched slots. Errors are forecast - actual, in MW."""

import math
from collections import defaultdict
from dataclasses import dataclass

from app.forecast import MatchResult


@dataclass(frozen=True)
class Summary:
    slots_used: int
    slots_total: int
    mae: float | None
    rmse: float | None
    bias: float | None
    nmae: float | None  # MAE as % of mean actual
    mean_actual: float | None


@dataclass(frozen=True)
class HourProfile:
    hour: int  # UTC hour of day (UK time in January)
    slots: int
    mean_error: float
    mae: float


def summarise(result: MatchResult) -> Summary:
    n = len(result.slots)
    if n == 0:
        return Summary(0, result.total, None, None, None, None, None)
    errors = [s.error for s in result.slots]
    mae = sum(abs(e) for e in errors) / n
    mean_actual = sum(s.actual for s in result.slots) / n
    return Summary(
        slots_used=n,
        slots_total=result.total,
        mae=mae,
        rmse=math.sqrt(sum(e * e for e in errors) / n),
        bias=sum(errors) / n,
        nmae=100 * mae / mean_actual if mean_actual else None,
        mean_actual=mean_actual,
    )


def error_by_hour(result: MatchResult) -> list[HourProfile]:
    by_hour: dict[int, list[int]] = defaultdict(list)
    for s in result.slots:
        by_hour[s.start_time.hour].append(s.error)
    return [
        HourProfile(hour, len(errs), sum(errs) / len(errs), sum(abs(e) for e in errs) / len(errs))
        for hour, errs in sorted(by_hour.items())
    ]
