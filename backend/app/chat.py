"""Chat assistant: answers questions about the January 2026 data with OpenAI tool calling.

The model never sees the raw data. It calls the tools below, which reuse the same
matching and metrics code as the dashboard, so its numbers match what is on screen.
"""

import json
import os
import time as clock
from collections import defaultdict, deque
from datetime import date, time
from typing import Any

from openai import OpenAI

from app.data import Snapshot, load_snapshot
from app.forecast import (
    DEFAULT_DAY_AHEAD_CUTOFF,
    DEFAULT_HORIZON_H,
    MatchResult,
    day_ahead_cutoff,
    horizon_cutoff,
    match,
)
from app.metrics import error_by_hour, summarise

DEFAULT_MODEL = "gpt-4o-mini"
MAX_TOOL_ROUNDS = 4
MAX_REPLY_TOKENS = 500
MAX_HISTORY = 12  # most recent messages sent to the model
MAX_MISSES = 10


class ChatUnavailable(Exception):
    """The server has no OpenAI key configured."""


# ---------- Tools ----------

_SELECTION_PARAMS = {
    "start": {"type": "string", "description": "First delivery date, YYYY-MM-DD, within 2026-01-01..2026-01-31"},
    "end": {"type": "string", "description": "Last delivery date (inclusive), YYYY-MM-DD"},
    "mode": {
        "type": "string",
        "enum": ["horizon", "day_ahead"],
        "description": "horizon: forecast made at least N hours before each hour. "
        "day_ahead: forecast available at a set time on the day before delivery.",
    },
    "horizon": {"type": "number", "description": "Hours ahead, 0-48 (horizon mode only)"},
    "cutoff": {"type": "string", "description": "Decision time HH:MM on the day before (day_ahead mode only)"},
}


def _tool(name: str, description: str, extra: dict | None = None) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {**_SELECTION_PARAMS, **(extra or {})},
                "required": ["start", "end", "mode"],
            },
        },
    }


TOOLS = [
    _tool("get_accuracy", "Overall forecast accuracy for a period: MAE, RMSE, bias, error % and hours compared."),
    _tool(
        "get_error_by_hour",
        "Time-of-day pattern: each hour of the day (00-23, UK time) averaged over every day in the period. "
        "Use for 'which hour of the day' or 'overnight vs afternoon' questions.",
    ),
    _tool(
        "get_daily_summary",
        "Accuracy for each delivery day, worst day (highest MAE) first, with counts of days the forecast was too high or too low.",
    ),
    _tool(
        "get_biggest_misses",
        "Specific dated hours (date and time) with the largest single forecast errors, biggest first.",
        {"limit": {"type": "integer", "description": f"How many hours to return, 1-{MAX_MISSES}"}},
    ),
]


def _match(snapshot: Snapshot, args: dict) -> tuple[dict, MatchResult]:
    start, end = date.fromisoformat(args["start"]), date.fromisoformat(args["end"])
    if args.get("mode", "horizon") == "day_ahead":
        at = time.fromisoformat(args["cutoff"]) if args.get("cutoff") else DEFAULT_DAY_AHEAD_CUTOFF
        selection = {"start": str(start), "end": str(end), "mode": "day_ahead", "cutoff": at.strftime("%H:%M")}
        cutoff = day_ahead_cutoff(at)
    else:
        hours = float(args.get("horizon", DEFAULT_HORIZON_H))
        selection = {"start": str(start), "end": str(end), "mode": "horizon", "horizon": hours}
        cutoff = horizon_cutoff(hours)
    return selection, match(snapshot, start, end, cutoff)


def _r(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def get_accuracy(snapshot: Snapshot, args: dict) -> dict:
    selection, result = _match(snapshot, args)
    s = summarise(result)
    return {
        "selection": selection,
        "hoursCompared": s.slots_used,
        "hoursTotal": s.slots_total,
        "maeMw": _r(s.mae),
        "rmseMw": _r(s.rmse),
        "biasMw": _r(s.bias),
        "errorPct": _r(s.nmae),
        "meanActualMw": _r(s.mean_actual),
    }


def get_error_by_hour(snapshot: Snapshot, args: dict) -> dict:
    selection, result = _match(snapshot, args)
    hours = [
        {"hour": h.hour, "hoursCompared": h.slots, "meanErrorMw": _r(h.mean_error), "maeMw": _r(h.mae)}
        for h in error_by_hour(result)
    ]
    ranked = sorted(hours, key=lambda h: h["maeMw"])
    return {
        "selection": selection,
        "worstHour": ranked[-1]["hour"] if ranked else None,  # by average miss size
        "bestHour": ranked[0]["hour"] if ranked else None,
        "mostOverForecastHour": max(hours, key=lambda h: h["meanErrorMw"])["hour"] if hours else None,
        "hours": hours,
    }


def get_daily_summary(snapshot: Snapshot, args: dict) -> dict:
    selection, result = _match(snapshot, args)
    by_day: dict[date, list] = defaultdict(list)
    for s in result.slots:
        by_day[s.start_time.date()].append(s)
    days = []
    for day, slots in sorted(by_day.items()):
        n = len(slots)
        days.append({
            "date": str(day),
            "hoursCompared": n,
            "maeMw": _r(sum(abs(s.error) for s in slots) / n),
            "biasMw": _r(sum(s.error for s in slots) / n),
            "meanActualMw": _r(sum(s.actual for s in slots) / n),
        })
        days[-1]["forecastWas"] = "too high" if days[-1]["biasMw"] > 0 else "too low"
    # Small models read lists top-down and miscount, so rank and count here rather than leave it to the model.
    days.sort(key=lambda d: d["maeMw"], reverse=True)
    return {
        "selection": selection,
        "order": "worst day (highest MAE) first",
        "daysTooHigh": sum(d["forecastWas"] == "too high" for d in days),
        "daysTooLow": sum(d["forecastWas"] == "too low" for d in days),
        "days": days,
    }


def get_biggest_misses(snapshot: Snapshot, args: dict) -> dict:
    selection, result = _match(snapshot, args)
    limit = max(1, min(MAX_MISSES, int(args.get("limit", 5))))
    worst = sorted(result.slots, key=lambda s: abs(s.error), reverse=True)[:limit]
    misses = [
        {
            "hourStarting": s.start_time.strftime("%Y-%m-%d %H:%M"),
            "actualMw": s.actual,
            "forecastMw": s.forecast,
            "errorMw": s.error,
            "forecastPublished": s.publish_time.strftime("%Y-%m-%d %H:%M"),
        }
        for s in worst
    ]
    return {"selection": selection, "misses": misses}


HANDLERS = {
    "get_accuracy": get_accuracy,
    "get_error_by_hour": get_error_by_hour,
    "get_daily_summary": get_daily_summary,
    "get_biggest_misses": get_biggest_misses,
}


def run_tool(name: str, raw_args: str, snapshot: Snapshot | None = None) -> dict:
    """Run one tool call. Bad input comes back as an error the model can read and correct."""
    handler = HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool {name}"}
    try:
        return handler(snapshot or load_snapshot(), json.loads(raw_args or "{}"))
    except (ValueError, KeyError, TypeError) as exc:
        return {"error": str(exc)}


# ---------- Conversation ----------


def system_prompt(settings: dict) -> str:
    return f"""You are the assistant inside Windsight, a dashboard for an energy trading team.
It compares the UK national wind power forecast (Elexon WINDFOR) with actual wind generation
(Elexon FUELHH) for delivery in January 2026. Times are UK time, which is UTC in January.
Only hourly slots are compared.

Definitions: error = forecast - actual, in MW. Positive error means the forecast was too high.
MAE = average size of the error. Bias = average error (shows which way it tends to miss).
RMSE weights big misses more. Error % = MAE as a share of average actual output.
"Hours ahead" picks the latest forecast made at least that many hours before each hour.
"Day before" picks the latest forecast available at a set time on the day before delivery.

The user is currently looking at: {json.dumps(settings)}.
Use these settings unless the user asks about something else.

Rules:
- Get every number from the tools. Never guess or invent figures.
- Only data for 1-31 January 2026 exists. Say so if asked about other dates.
- Answer in plain text, no markdown. Keep it short: 2-5 sentences, or a few short lines.
- Round to whole MW, or GW with one decimal for big values.
- When you give a bias, say whether the forecast was too high or too low.
- Politely decline questions that are not about this data or the dashboard."""


_recent: dict[str, deque] = defaultdict(deque)


def allow(client_id: str, limit: int = 20, window_s: int = 600) -> bool:
    """Small per-client rate limit. Per server instance only, which is enough to stop casual abuse."""
    now = clock.monotonic()
    hits = _recent[client_id]
    while hits and now - hits[0] > window_s:
        hits.popleft()
    if len(hits) >= limit:
        return False
    hits.append(now)
    return True


def _client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise ChatUnavailable
    return OpenAI(api_key=key, timeout=20, max_retries=1)


def _ask(client, model: str, convo: list[dict], tool_choice: str):
    response = client.chat.completions.create(
        model=model,
        messages=convo,
        tools=TOOLS,
        tool_choice=tool_choice,
        max_completion_tokens=MAX_REPLY_TOKENS,
    )
    return response.choices[0].message


def _text(msg) -> str:
    return (msg.content or "").strip() or "Sorry, I couldn't work that out. Try asking another way."


def reply(messages: list[dict[str, str]], settings: dict[str, Any], client=None) -> str:
    """Answer the last user message, calling tools as needed."""
    client = client or _client()
    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    convo: list[dict] = [{"role": "system", "content": system_prompt(settings)}, *messages[-MAX_HISTORY:]]

    for round_no in range(MAX_TOOL_ROUNDS):
        # The first round must call a tool, so every answer starts from real figures.
        msg = _ask(client, model, convo, "required" if round_no == 0 else "auto")
        if not msg.tool_calls:
            return _text(msg)
        convo.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [tc.model_dump() for tc in msg.tool_calls],
        })
        for tc in msg.tool_calls:
            result = run_tool(tc.function.name, tc.function.arguments)
            convo.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)})
    # Out of tool rounds: answer with what it has.
    return _text(_ask(client, model, convo, "none"))
