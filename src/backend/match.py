# match.py — Manhattan (scaled numerics) + Jaccard (subject ID sets)

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
ALPHA_NUMERIC = 0.7   # weight for Manhattan similarity (numeric features)
BETA_JACCARD  = 0.3   # weight for subject-set Jaccard similarity
assert abs(ALPHA_NUMERIC + BETA_JACCARD - 1.0) < 1e-6, "Weights must sum to 1"

GPA_MAX = 4.0                 # Normalize GPA to [0,4] then to [0,1]
DEADLINE_MAX_DAYS = 180       # Sooner is better, cap at ~6 months

# Credit when scholarship Ecountry is “International”
ELIG_INTERNATIONAL_SCORE = 0.7

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

def _deadline_score(d: Optional[datetime]) -> float:
    """
    Sooner deadlines → higher score. Past/missing → 0.
    0..1 linear decay across DEADLINE_MAX_DAYS.
    """
    days = _days_until(d)
    if days is None or days < 0:
        return 0.0
    return _clip01(1.0 - (days / DEADLINE_MAX_DAYS))

def _normalize_gpa(x) -> float:
    return _clip01(_to_float(x, 0.0) / GPA_MAX)

def _level_match(user_level: str, s_level) -> float:
    if not user_level:
        return 0.0
    if isinstance(s_level, list):
        ok = user_level in s_level
    else:
        ok = (user_level == s_level)
    return 1.0 if ok else 0.0

def _country_match(user_country: str, s_country: str) -> float:
    """
    Country match only considers UK/USA aliases. Anything else is ignored (0).
    """
    uc = _norm_country(user_country)
    sc = _norm_country(s_country)
    if not uc or not sc:
        return 0.0
    return 1.0 if uc == sc else 0.0

def _gender_ok(user_gender: str, s_gender: str) -> float:
    """
    If user = Male  -> match 'All' or 'Male' (not 'Female').
    If user = Female-> match 'All' or 'Female' (not 'Male').
    If user blank   -> only 'All' counts.
    """
    ug = _norm_gender(user_gender)
    sg = _norm_gender(s_gender) or "all"

    if sg == "all":
        return 1.0
    if ug == "":
        return 0.0
    return 1.0 if ug == sg else 0.0

def _eligible_country_ok(user_country: str, s_ecountry) -> float:
    """
    Returns:
      1.0  -> user country explicitly allowed (UK/USA only after normalization)
      0.7  -> scholarship is International (counts even if user country is blank)
      0.0  -> otherwise
    """
    uc = _norm_country(user_country)  # '' if not UK/USA or blank

    # Scholarship stores a list
    if isinstance(s_ecountry, list):
        # International present?
        if any(_is_international(x) for x in s_ecountry):
            return ELIG_INTERNATIONAL_SCORE
        norm_set = {_norm_country(x) for x in s_ecountry if _norm_country(x)}
        return 1.0 if (uc and uc in norm_set) else 0.0

    # Scholarship stores a single value
    if _is_international(s_ecountry):
        return ELIG_INTERNATIONAL_SCORE
    sc = _norm_country(s_ecountry)
    return 1.0 if (uc and sc and sc == uc) else 0.0

# -----------------------------------------------------------------------------
# Subjects: operate on ID sets (fast, no name mapping)
# -----------------------------------------------------------------------------
def _user_subject_id_set_from_userinfo(uinfo: Dict[str, Any]) -> set[str]:
    """
    User’s preferred subject IDs from prefs.fieldIds (strings/numbers) -> set of strings.
    """
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
    Jaccard on ID sets. Scholarship wildcard → full match when user chose any.
    """
    if "__ANY__" in B:
        return 1.0 if A else 0.0
    if not A and not B:
        return 0.0
    inter = len(A & B)
    union = len(A | B)
    return inter / union if union else 0.0

def _manhattan_similarity(u_vec: List[float], i_vec: List[float]) -> float:
    """
    L1 similarity in [0,1]: 1 - mean(|u - i|).
    Assumes both vectors are scaled to [0,1].
    """
    if not u_vec or not i_vec or len(u_vec) != len(i_vec):
        return 0.0
    diffs = [abs(a - b) for a, b in zip(u_vec, i_vec)]
    l1 = sum(diffs) / len(diffs)
    return _clip01(1.0 - l1)

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
    # Normalize fieldIds to strings (keep both list & set forms easy)
    raw_ids = prefs.get("fieldIds") or []
    field_ids = [str(x).strip() for x in raw_ids if str(x).strip()]

    # Normalize country now so downstream uses canonical tokens
    norm_country = _norm_country(prefs.get("country"))

    return {
        "email": user.get("email"),
        "display_name": user.get("name") or (user.get("email", "").split("@")[0] or "user"),
        "country": norm_country,                         # canonical '' | 'uk' | 'usa'
        "level": _norm_str(prefs.get("level")),
        "min_gpa": _to_float(prefs.get("min_gpa"), 0.0),
        "gender": _norm_gender(prefs.get("gender")),     # 'male' | 'female' | '' (blank)
        "Ecountry": norm_country,                        # reuse user country for eligibility
        "fieldIds": field_ids,                           # ← key for Jaccard on IDs
    }

def _collection_name_for_user(userinfo: Dict[str, Any]) -> str:
    """
    Name pattern: "<safeDisplayName>ranking"
    """
    safe = re.sub(r"[^A-Za-z0-9_-]", "", userinfo["display_name"]) or "user"
    return f"{safe}ranking"

# -----------------------------------------------------------------------------
# Scoring: Manhattan (numeric) + Jaccard (subject IDs)
# -----------------------------------------------------------------------------
def _calc_rank(s: Dict[str, Any], u: Dict[str, Any]) -> float:
    """
    Final score in 0..100 (for continuity with min_rank filters).
    Score = 100 * [ ALPHA * ManhattanSim(numeric) + BETA * Jaccard(subject IDs) ].
    """
    # Scholarship raw fields
    s_country   = _norm_str(s.get("country"))
    s_level     = s.get("level")
    s_min_gpa   = _normalize_gpa(s.get("min_gpa"))
    s_gender    = _norm_str(s.get("Egender") or "All")
    s_ecountry  = s.get("Ecountry")
    s_deadline  = _parse_deadline_mixed(s.get("deadline"))

    # Numeric components (all 0..1)
    comp_level      = _level_match(u["level"], s_level)               # 0 or 1
    comp_country    = _country_match(u["country"], s_country)         # 0 or 1 (UK/USA only)
    comp_gender     = _gender_ok(u["gender"], s_gender)               # 0 or 1 with All logic
    comp_elig       = _eligible_country_ok(u["Ecountry"], s_ecountry) # 1.0 | 0.7 | 0.0
    comp_deadline   = _deadline_score(s_deadline)                     # 0..1

    # GPA fit: 1 if user_gpa_norm >= min_gpa_norm, else linearly decays to 0
    user_gpa_norm = _normalize_gpa(u["min_gpa"])
    gap = s_min_gpa - user_gpa_norm
    comp_gpa = 1.0 if gap <= 0 else _clip01(1.0 - gap)

    item_vec = [comp_level, comp_country, comp_gender, comp_elig, comp_deadline, comp_gpa]
    user_vec = [1.0] * len(item_vec)  # ideal target: we want all matches

    s_num = _manhattan_similarity(user_vec, item_vec)  # 0..1

    # Jaccard on subject ID sets
    u_ids = _user_subject_id_set_from_userinfo(u)          # set[str]
    s_ids = _scholar_subject_id_set(s.get("fields"))       # set[str] (or {"__ANY__"})
    s_sub = _jaccard_ids(u_ids, s_ids)                     # 0..1

    blended = (ALPHA_NUMERIC * s_num) + (BETA_JACCARD * s_sub)  # 0..1
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
            "country": 1,
            "level": 1,
            "min_gpa": 1,
            "Egender": 1,
            "Ecountry": 1,
            "deadline": 1,
            "fields": 1,
        }

        ranked: List[Dict[str, Any]] = []

        # IMPORTANT: do NOT use no_cursor_timeout=True on Atlas free tiers
        for s in scholar_col.find({}, projection=PROJ, batch_size=1000):
            score = _calc_rank(s, uinfo)
            ranked.append({"scholarid": s["_id"], "rank": score})

        ranked.sort(key=lambda r: r["rank"], reverse=True)

        ranking_col.delete_many({})
        if ranked:
            # If you expect many rows, insert in chunks to be extra safe:
            # for i in range(0, len(ranked), 5000):
            #     ranking_col.insert_many(ranked[i:i+5000])
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
