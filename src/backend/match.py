# match.py
from datetime import datetime
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
import os
import re

from fastapi import APIRouter, HTTPException, Query
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv, dotenv_values
from pathlib import Path

router = APIRouter()

# ---- ENV & DB (mirror main.py so this file is standalone) ----
CANDIDATES = [
    Path(__file__).with_name(".env"),
    Path(__file__).parents[2] / ".env",
    Path.cwd() / ".env",
]
loaded_from = None
for p in CANDIDATES:
    if p.exists():
        load_dotenv(p, override=True)
        loaded_from = str(p)
        break

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI and loaded_from:
    MONGODB_URI = dotenv_values(loaded_from).get("MONGODB_URI")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI missing for match.py")

client = MongoClient(MONGODB_URI)
db = client["scholardatas"]
scholar_col = db["scholarships"]
users_col = db["users"]
fields_col = db["fields"]

# ---- helpers ----
def parse_deadline(raw_date: Optional[str]) -> datetime:
    try:
        return datetime.strptime((raw_date or "").strip(), "%d/%b/%y")  # e.g. 1/Jan/25
    except Exception:
        # fallback so comparisons work
        return datetime(1900, 1, 1)

def _get_userinfo(email: str) -> Dict[str, Any]:
    """Fetch user + prefs and expand fieldIds -> field names."""
    user = users_col.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found for {email}")

    prefs = user.get("prefs", {})
    field_ids = [int(x) for x in prefs.get("fieldIds", []) if str(x).isdigit()]

    field_names: List[str] = []
    if field_ids:
        cur = fields_col.find({"id": {"$in": field_ids}}, {"_id": 0, "name": 1})
        field_names = [d["name"] for d in cur if d.get("name")]

    # Always include “Any” so general‑purpose scholarships are eligible
    fields = ["Any"] + field_names

    userinfo = {
        "email": user.get("email"),
        "display_name": user.get("name") or (user.get("email", "").split("@")[0] or "user"),
        "country": prefs.get("country", "").strip(),
        "fields": fields,
        "level": prefs.get("level", "").strip(),
        "min_gpa": float(prefs.get("min_gpa", 0) or 0),
        "gender": prefs.get("gender", "").strip(),
        "Ecountry": prefs.get("country", "").strip(),
    }
    return userinfo

def _calc_rank(s: Dict[str, Any], u: Dict[str, Any]) -> float:
    """Score one scholarship against user prefs."""
    rank = 0.0

    # Country
    if u["country"] and str(s.get("country", "")).strip().lower() == u["country"].lower():
        rank += 10

    # Fields (user fields are names). Scholarship doc might be CSV string or list—handle both.
   # Fields (user fields are names). Scholarship doc might be CSV string or list—handle both.
    s_fields = s.get("fields") or []
    if isinstance(s_fields, str):
        s_fields = [x.strip() for x in s_fields.split(",") if x.strip()]
    # normalize for safe matching (case-insensitive, trim)
    s_fields_norm = {x.strip().casefold() for x in s_fields if x}

    u_fields = [x for x in (u.get("fields") or []) if isinstance(x, str) and x.strip()]
    if u_fields:
        total = 20.0
        cof = max(1, len(u_fields))
        per = total / cof

        for f in u_fields:
            f_norm = f.strip().casefold()

            # If the user includes 'Any' → add bonus per your rule
            if f_norm == "any":
                rank += (per - 5) if per > 5 else 2

            # If scholarship contains this field → add distributed points
            if f_norm in s_fields_norm:
                rank += per


    # Level
    s_level = s.get("level", "")
    if u["level"] and u["level"] in (s_level if isinstance(s_level, list) else [s_level]):
        rank += 15

    # GPA (scholar’s min_gpa may be string like "Not Specified ")
    try:
        s_min = float(s.get("min_gpa") or 0)
    except Exception:
        s_min = 0
    if u["min_gpa"] >= s_min:
        rank += 15
    elif u["min_gpa"] >= s_min - 0.2:
        rank += 10

    # Deadline
    d = parse_deadline(s.get("deadline"))
    if d.year > 1900 and datetime.utcnow() < d:
        rank += 10
    else:
        rank += 5  # no deadline or past → small credit

    # Gender
    s_gender = (s.get("Egender") or "All").strip()
    if s_gender == "All" or (u["gender"] and s_gender == u["gender"]):
        rank += 15

    # Eligible Country
    s_ecountry = s.get("Ecountry") or ""
    if isinstance(s_ecountry, list):
        ec_ok = (u["Ecountry"] in s_ecountry)
    else:
        ec_ok = (s_ecountry == "International" or (u["Ecountry"] and s_ecountry == u["Ecountry"]))
    if ec_ok:
        rank += 15

    return round(rank, 2)

def _collection_name_for_user(userinfo: Dict[str, Any]) -> str:
    # Same pattern you used before: "<Name>ranking"
    # Use display_name from user or email prefix; strip unsafe chars just in case
    safe = re.sub(r"[^A-Za-z0-9_-]", "", userinfo["display_name"]) or "user"
    return f"{safe}ranking"

# ---- endpoints ----

@router.post("/api/match/build")
def build_user_ranking(email: str):
    """
    Build (or rebuild) the <UserName>ranking collection for the given user email.
    Returns how many rows were written.
    """
    uinfo = _get_userinfo(email)
    ranking_col = db[_collection_name_for_user(uinfo)]

    ranked: List[Dict[str, Any]] = []
    for s in scholar_col.find({}):
        score = _calc_rank(s, uinfo)
        ranked.append({"scholarid": s["_id"], "rank": score})

    ranked.sort(key=lambda r: r["rank"], reverse=True)

    ranking_col.delete_many({})
    if ranked:
        ranking_col.insert_many(ranked)

    return {
        "ok": True,
        "user": email,
        "collection": ranking_col.name,
        "total": len(ranked),
    }

@router.get("/api/match")
def get_user_matches(
    email: str,
    min_rank: float = Query(60, ge=0),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
):
    """
    Read from the user's <UserName>ranking collection and join the top results
    with scholarships. Filters by min_rank.
    """
    uinfo = _get_userinfo(email)
    ranking_col = db[_collection_name_for_user(uinfo)]

    rank_docs = list(ranking_col.find({"rank": {"$gte": float(min_rank)}}, {"_id": 0, "scholarid": 1, "rank": 1}))
    if not rank_docs:
        return {"total": 0, "page": page, "limit": limit, "items": []}

    ids = [rd["scholarid"] if isinstance(rd["scholarid"], ObjectId) else ObjectId(rd["scholarid"]) for rd in rank_docs]
    rank_map = {str(rd["scholarid"]): rd["rank"] for rd in rank_docs}

    cur = scholar_col.find({"_id": {"$in": ids}})
    docs = []
    for d in cur:
        item = {
            "id": str(d["_id"]),
            "scholarship_name": d.get("scholarship_name"),
            "provider": d.get("provider"),
            "country": d.get("country"),
            "fields": d.get("fields"),
            "level": d.get("level"),
            "deadline": d.get("deadline"),
            "amount": (d.get("amount") or "").replace("�", "£").strip() or "Fully Funded",
            "type": d.get("type"),
            "link": d.get("link"),
            "rank": rank_map.get(str(d["_id"]), 0),
        }
        docs.append(item)

    # sort by rank desc
    docs.sort(key=lambda x: (x.get("rank") is None, x.get("rank", 0)), reverse=True)

    total = len(docs)
    start = (page - 1) * limit
    end = start + limit
    return {"total": total, "page": page, "limit": limit, "items": docs[start:end]}
