# match.py — Gower dissimilarity (mixed features) → similarity + Jaccard (subject ID sets)

from datetime import datetime
from typing import List, Dict, Any, Optional
import os
import re
import logging

from fastapi import APIRouter, HTTPException, Query
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv, dotenv_values
from pathlib import Path

# -----------------------------------------------------------------------------
# Router / logging
# -----------------------------------------------------------------------------
router = APIRouter()
logging.basicConfig(level=logging.INFO)

# -----------------------------------------------------------------------------
# ENV & DB (standalone, mirrors main.py so this module can be imported alone)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# Tunable weights & scaling caps
# -----------------------------------------------------------------------------
ALPHA_NUMERIC = 0.7   # weight for (1 - Gower dissimilarity) on mixed features
BETA_JACCARD  = 0.3   # weight for subject-set Jaccard similarity
assert abs(ALPHA_NUMERIC + BETA_JACCARD - 1.0) < 1e-6, "Weights must sum to 1"

GPA_MAX = 4.0                 # Normalize GPA to [0,4] then to [0,1]
DEADLINE_MAX_DAYS = 180       # Sooner is better, cap at ~6 months

# Credit when scholarship Ecountry is “International” (partial match)
ELIG_INTERNATIONAL_SCORE = 0.7   # similarity; distance will be (1 - 0.7) = 0.3

# -----------------------------------------------------------------------------
# Country normalization (only UK and USA are recognized)
# -----------------------------------------------------------------------------
ALLOWED_COUNTRIES = {"uk", "usa"}

COUNTRY_ALIASES = {
    # UK variants
    "uk": "uk", "u k": "uk", "u.k": "uk", "u.k.": "uk",
    "united kingdom": "uk", "great britain": "uk", "britain": "uk", "gb": "uk",
    "england": "uk", "scotland": "uk", "wales": "uk", "northern ireland": "uk",

    # USA variants
    "us": "usa", "u s": "usa", "u.s": "usa", "u.s.": "usa",
    "usa": "usa", "america": "usa", "united states": "usa",
    "united states of america": "usa",
}

def _norm_str(s: Optional[str]) -> str:
    return (s or "").strip()

def _casefold(s: Optional[str]) -> str:
    return _norm_str(s).casefold()

def _norm_country(raw: Optional[str]) -> str:
    """
    Normalize to 'uk' or 'usa'. If not recognized or not in allowed set → '' (ignored).
    """
    if not raw:
        return ""
    key = _casefold(re.sub(r"[^\w\s]", "", str(raw)))
    key = re.sub(r"\s+", " ", key).strip()
    canon = COUNTRY_ALIASES.get(key, key)
    return canon if canon in ALLOWED_COUNTRIES else ""

def _is_international(s: Optional[str]) -> bool:
    return _casefold(s) == "international"

# -----------------------------------------------------------------------------
# Gender normalization
# -----------------------------------------------------------------------------
def _norm_gender(g: Optional[str]) -> str:
    g2 = _casefold(g)
    if g2 in {"male", "m"}:
        return "male"
    if g2 in {"female", "f"}:
        return "female"
    if g2 in {"all", "any"}:
        return "all"
    return ""  # unknown/blank

# -----------------------------------------------------------------------------
# Helpers: numeric normalization & parsing
# -----------------------------------------------------------------------------
def _to_float(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default

def _clip01(x: float) -> float:
    return max(0.0, min(1.0, x))

def _parse_deadline_mixed(raw) -> Optional[datetime]:
    """
    Accepts datetime (already in Mongo) or strings like '15/May/25', '2025-05-15', '15-05-2025'.
    Returns None if invalid/missing.
    """
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, dict) and "$date" in raw:
        try:
            return datetime.fromisoformat(_norm_str(raw["$date"]).replace("Z", "+00:00"))
        except Exception:
            pass
    s = _norm_str(str(raw or ""))
    if not s:
        return None
    for fmt in ("%d/%b/%y", "%d/%B/%y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def _days_until(d: Optional[datetime]) -> Optional[int]:
    if not d:
        return None
    now = datetime.utcnow()
    return (d - now).days

# -------------- Per-feature *dissimilarities* (0 = identical/best, 1 = worst) --------------
def _deadline_dist(d: Optional[datetime]) -> float:
    """
    Gower distance for deadline: d = min(1, days_until / DEADLINE_MAX_DAYS).
    Past/missing -> 1 (worst).
    """
    days = _days_until(d)
    if days is None or days < 0:
        return 1.0
    return _clip01(days / DEADLINE_MAX_DAYS)

def _normalize_gpa(x) -> float:
    return _clip01(_to_float(x, 0.0) / GPA_MAX)

def _gpa_dist(user_min_gpa_norm: float, schol_min_gpa_norm: float) -> float:
    """
    If user >= scholarship minimum: distance 0 (no penalty).
    Else: distance = (schol_min - user_min) in [0,1].
    """
    gap = schol_min_gpa_norm - user_min_gpa_norm
    return 0.0 if gap <= 0 else _clip01(gap)

def _level_dist(user_level: str, schol_level) -> Optional[float]:
    """
    Nominal distance: 0 if matches (or in list), else 1. If user level blank -> None (ignore).
    """
    if not user_level:
        return None
    if isinstance(schol_level, list):
        ok = user_level in schol_level
    else:
        ok = (user_level == schol_level)
    return 0.0 if ok else 1.0

def _type_dist(user_type: Optional[str], schol_type: Optional[str]) -> Optional[float]:
    """
    Nominal distance: 0 if equal, 1 if different; None if user didn't specify.
    """
    if not user_type or not schol_type:
        return None
    return 0.0 if _casefold(user_type) == _casefold(schol_type) else 1.0

def _gender_dist(user_gender: str, schol_gender: str) -> Optional[float]:
    """
    If schol = 'All' -> distance 0 (always ok).
    If user blank    -> distance 1 unless schol is 'All' (already covered).
    Else             -> distance 0 if exact match, 1 otherwise.
    """
    ug = _norm_gender(user_gender)
    sg = _norm_gender(schol_gender) or "all"
    if sg == "all":
        return 0.0
    if ug == "":
        return 1.0
    return 0.0 if ug == sg else 1.0

def _eligibility_dist(user_country: str, s_ecountry) -> Optional[float]:
    """
    Returns distances:
      exact eligible country (UK/USA) -> 0.0
      'International'                 -> 0.3  (i.e., 1 - 0.7 similarity)
      otherwise                       -> 1.0
    If user country blank or not UK/USA, 'International' still yields 0.3.
    """
    uc = _norm_country(user_country)  # '' if not UK/USA or blank

    # Scholarship stores a list
    if isinstance(s_ecountry, list):
        if any(_is_international(x) for x in s_ecountry):
            return 1.0 - ELIG_INTERNATIONAL_SCORE  # 0.3
        norm_set = {_norm_country(x) for x in s_ecountry if _norm_country(x)}
        if uc and uc in norm_set:
            return 0.0
        return 1.0

    # Scholarship stores a single value
    if _is_international(s_ecountry):
        return 1.0 - ELIG_INTERNATIONAL_SCORE
    sc = _norm_country(s_ecountry)
    if uc and sc and sc == uc:
        return 0.0
    return 1.0

# -----------------------------------------------------------------------------
# Subjects: operate on ID sets (fast, no name mapping) → Jaccard similarity
# -----------------------------------------------------------------------------
def _user_subject_id_set_from_userinfo(uinfo: Dict[str, Any]) -> set[str]:
    ids = uinfo.get("fieldIds") or []
    out = [str(x).strip() for x in ids if str(x).strip()]
    return set(out)

def _scholar_subject_id_set(raw) -> set[str]:
    """
    Scholarship fields -> set of string IDs. Accepts CSV string or list.
    Supports wildcard: "0" / "any" / "all" → special token "__ANY__".
    """
    if isinstance(raw, str):
        toks = [t.strip() for t in raw.split(",") if t and t.strip()]
    elif isinstance(raw, list):
        toks = [str(t).strip() for t in raw if str(t).strip()]
    else:
        toks = []
    s = set(toks)
    lower = {t.lower() for t in s}
    if "0" in s or "any" in lower or "all" in lower:
        return {"__ANY__"}
    return s

def _jaccard_ids(A: set[str], B: set[str]) -> float:
    """
    Jaccard similarity on ID sets (0..1). Scholarship wildcard → full match when user chose any.
    """
    if "__ANY__" in B:
        return 1.0 if A else 0.0
    if not A and not B:
        return 0.0
    inter = len(A & B)
    union = len(A | B)
    return inter / union if union else 0.0

# -----------------------------------------------------------------------------
# Gower dissimilarity (weighted average of per-feature distances)
# -----------------------------------------------------------------------------
def _gower_dissimilarity(dist_components: List[Optional[float]], weights: List[float]) -> float:
    """
    Weighted Gower dissimilarity in [0,1]:
        D = (Σ w_i * d_i) / (Σ w_i)
    Ignores components that are None or weights <= 0.
    If no component contributes, return 1.0 (so similarity = 0.0).
    """
    if not dist_components or not weights or len(dist_components) != len(weights):
        return 1.0
    num = 0.0
    den = 0.0
    for d_i, w_i in zip(dist_components, weights):
        if d_i is None or w_i <= 0:
            continue
        num += w_i * _clip01(float(d_i))
        den += w_i
    return 1.0 if den <= 0 else num / den

# -----------------------------------------------------------------------------
# User info
# -----------------------------------------------------------------------------
def _get_userinfo(email: str) -> Dict[str, Any]:
    """
    Fetch user + prefs. We use subject IDs directly (no name expansion).
    Expects prefs.fieldIds to hold subject IDs as strings/numbers.
    """
    user = users_col.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found for {email}")

    prefs = user.get("prefs", {}) or {}
    raw_ids = prefs.get("fieldIds") or []
    field_ids = [str(x).strip() for x in raw_ids if str(x).strip()]

    norm_country = _norm_country(prefs.get("country"))

    return {
        "email": user.get("email"),
        "display_name": user.get("name") or (user.get("email", "").split("@")[0] or "user"),
        "level": _norm_str(prefs.get("level")),
        "min_gpa": _to_float(prefs.get("min_gpa"), 0.0),
        "gender": _norm_gender(prefs.get("gender")),   # 'male' | 'female' | ''
        "Ecountry": norm_country,                       # canonical '' | 'uk' | 'usa'
        "fieldIds": field_ids,
        "prefer": prefs.get("prefer"),
    }

def _collection_name_for_user(userinfo: Dict[str, Any]) -> str:
    """
    Name pattern: "<safeDisplayName>ranking"
    """
    safe = re.sub(r"[^A-Za-z0-9_-]", "", userinfo["display_name"]) or "user"
    return f"{safe}ranking"

# -----------------------------------------------------------------------------
# Scoring: (1 - Gower distance on mixed) + Jaccard (subject IDs)
# -----------------------------------------------------------------------------
def _calc_rank(s: Dict[str, Any], u: Dict[str, Any]) -> float:
    """
    Final score in 0..100:
      Score = 100 * [ ALPHA_NUMERIC * (1 - D_gower)
                      + BETA_JACCARD  * Jaccard(subject IDs) ].
    """
    # Scholarship raw fields
    s_level     = s.get("level")
    s_min_gpa   = _normalize_gpa(s.get("min_gpa"))
    s_gender    = _norm_str(s.get("Egender") or "All")
    s_ecountry  = s.get("Ecountry")
    s_deadline  = _parse_deadline_mixed(s.get("deadline"))
    s_type      = s.get("type")

    # Per-feature distances (0..1) — None means "not applicable / ignore"
    d_level     = _level_dist(u["level"], s_level)                         # 0/1/None
    d_type      = _type_dist(u.get("prefer"), s_type)                      # 0/1/None
    d_gender    = _gender_dist(u["gender"], s_gender)                      # 0/1/None
    d_elig      = _eligibility_dist(u["Ecountry"], s_ecountry)             # 0/0.3/1
    d_deadline  = _deadline_dist(s_deadline)                               # 0..1

    user_gpa_norm = _normalize_gpa(u["min_gpa"])
    d_gpa      = _gpa_dist(user_gpa_norm, s_min_gpa)                       # 0..1

    dist_components = [d_level, d_type, d_gender, d_elig, d_deadline, d_gpa]
    weights         = [0.30,   0.20,   0.10,    0.10,   0.20,      0.10]

    D_gower = _gower_dissimilarity(dist_components, weights)               # 0..1
    s_num   = 1.0 - D_gower                                                # similarity

    # Jaccard on subject ID sets (similarity 0..1)
    u_ids = _user_subject_id_set_from_userinfo(u)
    s_ids = _scholar_subject_id_set(s.get("fields"))
    s_sub = _jaccard_ids(u_ids, s_ids)

    blended = (ALPHA_NUMERIC * s_num) + (BETA_JACCARD * s_sub)             # 0..1
    return round(100.0 * blended, 2)

# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@router.post("/api/match/build")
def build_user_ranking(email: str):
    """
    Build (or rebuild) the <DisplayName>ranking collection for the given user.
    Returns how many rows were written.
    """
    try:
        uinfo = _get_userinfo(email)
        ranking_name = _collection_name_for_user(uinfo)
        ranking_col = db[ranking_name]

        # Only fetch fields we actually score on (smaller payload = faster)
        PROJ = {
            "_id": 1,
            "country": 1,    # not used in score, but harmless to keep
            "level": 1,
            "min_gpa": 1,
            "Egender": 1,
            "Ecountry": 1,
            "deadline": 1,
            "fields": 1,
            "type": 1,
        }

        ranked: List[Dict[str, Any]] = []

        # IMPORTANT: do NOT use no_cursor_timeout=True on Atlas free tiers
        for s in scholar_col.find({}, projection=PROJ, batch_size=1000):
            score = _calc_rank(s, uinfo)
            ranked.append({"scholarid": s["_id"], "rank": score})

        ranked.sort(key=lambda r: r["rank"], reverse=True)

        ranking_col.delete_many({})
        if ranked:
            ranking_col.insert_many(ranked)

        return {
            "ok": True,
            "user": email,
            "collection": ranking_name,
            "total": len(ranked),
        }

    except HTTPException:
        raise
    except Exception:
        logging.exception("Error in building rankings")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@router.get("/api/match")
def get_user_matches(
    email: str,
    min_rank: float = Query(60, ge=0),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
):
    """
    Read from the user's <DisplayName>ranking collection and join the top results
    with scholarships. Filters by min_rank.
    """
    try:
        uinfo = _get_userinfo(email)
        ranking_name = _collection_name_for_user(uinfo)
        ranking_col = db[ranking_name]

        rank_docs = list(
            ranking_col.find(
                {"rank": {"$gte": float(min_rank)}},
                {"_id": 0, "scholarid": 1, "rank": 1}
            )
        )
        if not rank_docs:
            return {"total": 0, "page": page, "limit": limit, "items": []}

        ids = [
            rd["scholarid"] if isinstance(rd["scholarid"], ObjectId)
            else ObjectId(rd["scholarid"]) for rd in rank_docs
        ]
        rank_map = {str(rd["scholarid"]): rd["rank"] for rd in rank_docs}

        cur = scholar_col.find({"_id": {"$in": ids}})
        docs: List[Dict[str, Any]] = []
        for d in cur:
            item = {
                "id": str(d["_id"]),
                "scholarship_name": d.get("scholarship_name"),
                "provider": d.get("provider"),
                "country": d.get("country"),
                "fields": d.get("fields"),
                "level": d.get("level"),
                "deadline": d.get("deadline"),  # keep as-is; frontend can format
                "amount": (d.get("amount") or "").replace("�", "£").strip() or "Fully Funded",
                "type": d.get("type"),
                "link": d.get("link"),
                "rank": rank_map.get(str(d["_id"]), 0),
            }
            docs.append(item)

        # Sort & paginate
        docs.sort(key=lambda x: (x.get("rank") is None, x.get("rank", 0)), reverse=True)
        total = len(docs)
        start = (page - 1) * limit
        end = start + limit
        return {"total": total, "page": page, "limit": limit, "items": docs[start:end]}

    except HTTPException:
        raise
    except Exception:
        logging.exception("Error fetching user matches")
        raise HTTPException(status_code=500, detail="Internal Server Error")
