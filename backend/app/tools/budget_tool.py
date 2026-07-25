"""
Budget tool — spec Section 4.5 ("I only have $40 today. Plan my day.").

Pure arithmetic: splits a daily budget across the parts of a day so the model
has concrete per-slot ceilings to plan against instead of inventing numbers.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Share of the daily budget allocated to each slot, per travel style.
_ALLOCATIONS = {
    "budget": {
        "breakfast": 0.10,
        "morning_activity": 0.10,
        "lunch": 0.18,
        "afternoon_activity": 0.15,
        "dinner": 0.27,
        "transport": 0.15,
        "buffer": 0.05,
    },
    "balanced": {
        "breakfast": 0.10,
        "morning_activity": 0.15,
        "lunch": 0.18,
        "afternoon_activity": 0.17,
        "dinner": 0.25,
        "transport": 0.10,
        "buffer": 0.05,
    },
    "comfort": {
        "breakfast": 0.10,
        "morning_activity": 0.18,
        "lunch": 0.17,
        "afternoon_activity": 0.20,
        "dinner": 0.25,
        "transport": 0.07,
        "buffer": 0.03,
    },
}

_SLOT_LABELS = {
    "breakfast": "Breakfast",
    "morning_activity": "Morning activity",
    "lunch": "Lunch",
    "afternoon_activity": "Afternoon activity",
    "dinner": "Dinner",
    "transport": "Local transport",
    "buffer": "Buffer / tips",
}

MAX_PEOPLE = 20


def plan_budget_day(
    total_budget: float,
    currency: str = "USD",
    num_people: int = 1,
    style: str = "balanced",
    include_transport: bool = True,
) -> dict[str, Any]:
    """
    Split a day's budget into per-slot ceilings.

    Returns per-person and total figures — the model needs per-person numbers to
    recommend individual dishes and venues, and totals to sanity-check the day.
    """
    try:
        total = float(total_budget)
    except (TypeError, ValueError):
        return {"ok": False, "error": "total_budget must be a number."}

    if total <= 0:
        return {"ok": False, "error": "total_budget must be greater than zero."}

    try:
        people = int(num_people)
    except (TypeError, ValueError):
        people = 1
    people = max(1, min(MAX_PEOPLE, people))

    style_key = (style or "balanced").strip().lower()
    allocation = dict(_ALLOCATIONS.get(style_key, _ALLOCATIONS["balanced"]))

    if not include_transport:
        # Redistribute the transport share across the remaining slots so the
        # allocation still sums to 1.0 and the budget isn't silently lost.
        freed = allocation.pop("transport")
        remaining = sum(allocation.values())
        if remaining > 0:
            for slot in allocation:
                allocation[slot] += freed * (allocation[slot] / remaining)

    per_person_total = total / people

    breakdown = []
    for slot, share in allocation.items():
        slot_total = round(total * share, 2)
        breakdown.append(
            {
                "slot": slot,
                "label": _SLOT_LABELS.get(slot, slot.replace("_", " ").title()),
                "total": slot_total,
                "per_person": round(slot_total / people, 2),
            }
        )

    # Absorb rounding drift into the buffer (or the last slot) so the parts
    # always add up to the stated total.
    allocated = round(sum(item["total"] for item in breakdown), 2)
    drift = round(total - allocated, 2)
    if drift:
        target = next((i for i in breakdown if i["slot"] == "buffer"), breakdown[-1])
        target["total"] = round(target["total"] + drift, 2)
        target["per_person"] = round(target["total"] / people, 2)

    return {
        "ok": True,
        "currency": currency or "USD",
        "total_budget": round(total, 2),
        "num_people": people,
        "per_person_budget": round(per_person_total, 2),
        "style": style_key if style_key in _ALLOCATIONS else "balanced",
        "breakdown": breakdown,
        "guidance": (
            "These are ceilings, not targets. Prefer free or low-cost attractions "
            "in the morning, keep the largest share for dinner, and only suggest "
            "options that fit within each slot's per-person amount."
        ),
    }
