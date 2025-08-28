# src/backend/analysis_routes.py
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Dict, Any
from pymongo.database import Database
from dateutil import parser as dtparse

router = APIRouter(prefix="/analysis")

# ---- DB dependency (reuse app.state.mongo from main.py) ----
def get_db(request: Request) -> Database:
    # You will set app.state.mongo in main.py
    return request.app.state.mongo["scholardatas"]


# ---------- /analysis/countries ----------
@router.get("/countries")
def countries(db: Database = Depends(get_db)) -> List[Dict[str, Any]]:
    pipe = [
        {"$match": {"country": {"$type": "string", "$ne": ""}}},
        {"$group": {"_id": "$country", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "label": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
    ]
    return list(db["scholarships"].aggregate(pipe))


# ---------- /analysis/funding-by-level ----------
@router.get("/funding-by-level")
def funding_by_level(db: Database = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Output shape:
    [
      { "level": "Bachelor", "Full": 12, "Partial": 7 },
      { "level": "Master",   "Full": 20, "Partial": 9 },
      { "level": "PhD",      "Full": 14, "Partial": 5 }
    ]
    """
    # Normalize level/type in pipeline, then pivot in Python for simple, robust logic
    cur = db["scholarships"].find(
        {"level": {"$type": "string"}, "type": {"$type": "string"}},
        {"level": 1, "type": 1, "_id": 0},
    )

    buckets: Dict[str, Dict[str, int]] = {}
    for doc in cur:
        lvl = (doc.get("level") or "").strip()
        typ = (doc.get("type") or "").lower()
        if not lvl:
            continue
        key = "Full" if "full" in typ else "Partial" if "partial" in typ else None
        if not key:
            continue
        buckets.setdefault(lvl, {"Full": 0, "Partial": 0})
        buckets[lvl][key] += 1

    # Keep common order
    order = ["Bachelor", "Master", "PhD", "Diploma", "Other"]
    out = []
    for lvl in order:
        if lvl in buckets:
            out.append({"level": lvl, **buckets[lvl]})

    # Any other random levels
    for lvl, counts in buckets.items():
        if lvl not in order:
            out.append({"level": lvl, **counts})
    return out


# ---------- /analysis/deadlines ----------
@router.get("/deadlines")
def deadlines(db: Database = Depends(get_db)) -> List[Dict[str, int]]:
    """
    Output shape (any year present in data):
    [{ "year": 2025, "month": 1, "count": 12 }, ...]
    We parse various deadline string formats safely.
    """
    cur = db["scholarships"].find(
        {"deadline": {"$exists": True, "$ne": ""}}, {"deadline": 1, "_id": 0}
    )

    counts: Dict[tuple, int] = {}
    for doc in cur:
        raw = doc.get("deadline")
        if not raw:
            continue
        # Accept native date, ISO strings, or odd strings
        try:
            dt = raw
            if not hasattr(dt, "year"):
                dt = dtparse.parse(str(raw))
            y, m = dt.year, dt.month
            counts[(y, m)] = counts.get((y, m), 0) + 1
        except Exception:
            # ignore unparseable strings
            continue

    out = [{"year": y, "month": m, "count": c} for (y, m), c in counts.items()]
    out.sort(key=lambda x: (x["year"], x["month"]))
    return out


# ---------- category constants ----------
CAT_ANY               = "Any Field"
CAT_BUSINESS          = "Business & Management"
CAT_ARTS              = "Arts, Culture & Design"
CAT_HEALTH_LIFE       = "Health & Life Sciences"
CAT_HUMANITIES_SOCIAL = "Humanities & Social Sciences"
CAT_ENGINEERING       = "Engineering"
CAT_TECH              = "Technology & Computing"
CAT_LANG              = "Languages & Communication"

# Field ID -> Category
FIELD_TO_CAT = {
    # Any Field
    0: CAT_ANY,

    # Business & Management
    1: CAT_BUSINESS, 2: CAT_BUSINESS, 3: CAT_BUSINESS, 4: CAT_BUSINESS, 5: CAT_BUSINESS,
    6: CAT_BUSINESS, 7: CAT_BUSINESS, 8: CAT_BUSINESS, 9: CAT_BUSINESS,
    45: CAT_BUSINESS, 46: CAT_BUSINESS, 47: CAT_BUSINESS, 71: CAT_BUSINESS,

    # Arts, Culture & Design
    10: CAT_ARTS, 11: CAT_ARTS, 12: CAT_ARTS, 13: CAT_ARTS, 14: CAT_ARTS,
    15: CAT_ARTS, 48: CAT_ARTS, 49: CAT_ARTS, 50: CAT_ARTS, 51: CAT_ARTS,
    79: CAT_ARTS, 80: CAT_ARTS,

    # Health & Life Sciences
    16: CAT_HEALTH_LIFE, 17: CAT_HEALTH_LIFE, 18: CAT_HEALTH_LIFE, 19: CAT_HEALTH_LIFE,
    20: CAT_HEALTH_LIFE, 21: CAT_HEALTH_LIFE, 26: CAT_HEALTH_LIFE, 27: CAT_HEALTH_LIFE,
    28: CAT_HEALTH_LIFE, 29: CAT_HEALTH_LIFE, 30: CAT_HEALTH_LIFE, 31: CAT_HEALTH_LIFE,
    32: CAT_HEALTH_LIFE, 33: CAT_HEALTH_LIFE, 34: CAT_HEALTH_LIFE,

    # Humanities & Social Sciences
    22: CAT_HUMANITIES_SOCIAL, 23: CAT_HUMANITIES_SOCIAL, 24: CAT_HUMANITIES_SOCIAL, 25: CAT_HUMANITIES_SOCIAL,
    35: CAT_HUMANITIES_SOCIAL, 36: CAT_HUMANITIES_SOCIAL, 37: CAT_HUMANITIES_SOCIAL, 38: CAT_HUMANITIES_SOCIAL,
    39: CAT_HUMANITIES_SOCIAL, 40: CAT_HUMANITIES_SOCIAL, 41: CAT_HUMANITIES_SOCIAL, 42: CAT_HUMANITIES_SOCIAL,
    43: CAT_HUMANITIES_SOCIAL, 73: CAT_HUMANITIES_SOCIAL, 77: CAT_HUMANITIES_SOCIAL, 78: CAT_HUMANITIES_SOCIAL,
    44: CAT_HUMANITIES_SOCIAL,  # Sports

    # Engineering
    54: CAT_ENGINEERING, 55: CAT_ENGINEERING, 56: CAT_ENGINEERING, 57: CAT_ENGINEERING,
    58: CAT_ENGINEERING, 59: CAT_ENGINEERING, 75: CAT_ENGINEERING, 76: CAT_ENGINEERING,

    # Technology & Computing
    52: CAT_TECH, 53: CAT_TECH, 60: CAT_TECH, 61: CAT_TECH, 62: CAT_TECH, 63: CAT_TECH,
    64: CAT_TECH, 70: CAT_TECH, 74: CAT_TECH,

    # Languages & Communication
    65: CAT_LANG, 66: CAT_LANG, 67: CAT_LANG, 68: CAT_LANG, 69: CAT_LANG, 72: CAT_LANG,
}

# Helper: parse scholarship "fields" into integer IDs
def _parse_field_ids(raw) -> set[int]:
    ids: set[int] = set()
    if raw is None:
        return ids
    if isinstance(raw, str):
        tokens = [t.strip() for t in raw.split(",") if t.strip()]
    elif isinstance(raw, list):
        tokens = raw
    else:
        tokens = [raw]

    for t in tokens:
        try:
            ids.add(int(str(t).strip()))
        except Exception:
            pass
    return ids

# ---------- /analysis/categories ----------
@router.get("/categories")
def categories(db: Database = Depends(get_db)) -> List[Dict[str, Any]]:
    cat_counts: Dict[str, int] = {}

    cursor = db["scholarships"].find({}, {"fields": 1, "_id": 0})
    for doc in cursor:
        seen_cats = set()
        for fid in _parse_field_ids(doc.get("fields")):
            cat = FIELD_TO_CAT.get(fid)
            if cat:
                seen_cats.add(cat)

        for cat in seen_cats:
            cat_counts[cat] = cat_counts.get(cat, 0) + 1

    out = [{"label": k, "count": v} for k, v in cat_counts.items()]
    out.sort(key=lambda x: (x["label"] != CAT_ANY, -x["count"], x["label"]))
    return out
