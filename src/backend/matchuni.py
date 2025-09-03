# matchuni.py
from datetime import datetime
from typing import List, Dict, Any, Optional
import os, re
from fastapi import APIRouter, HTTPException, Query
from pymongo import MongoClient
from pymongo.errors import CollectionInvalid
from dotenv import load_dotenv, dotenv_values
from pathlib import Path

router = APIRouter()

# ---------- Configurable weights ----------
# Numeric sub-weights (sum doesn't need to be 1; we re-normalize)
W_RANK   = 0.30
W_OUT    = 0.20
W_COUNTRY= 0.10

# Blend weights between numeric similarity and subjects Jaccard
ALPHA_NUMERIC = 0.60
BETA_SUBJECTS = 0.40

# Cap for rank scaling (lower is better). Adjust to your dataset.
RANK_CAP = 2000

# ---------- ENV & DB ----------
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

MONGODB_URI = os.getenv("MONGODB_URI") or (dotenv_values(loaded_from).get("MONGODB_URI") if loaded_from else None)
if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI missing for matchuni.py")

client = MongoClient(MONGODB_URI)
db = client["scholardatas"]
users_col = db["users"]
university_col = db["University"]
unisubjects_col = db["Unisubjects"]

# ---------- helpers ----------
def _safe_int(v, default: int = 0) -> int:
    try:
        if v is None: return default
        if isinstance(v, (int, float)): return int(v)
        s = str(v).strip().replace(",", "")
        return int(float(s))
    except Exception:
        return default

def _safe_float(v, default: float = 0.0) -> float:
    try:
        if v is None: return default
        if isinstance(v, (int, float)): return float(v)
        s = str(v).strip().replace("%", "").replace(" ", "")
        return float(s)
    except Exception:
        return default

def _clip01(x: Optional[float]) -> float:
    try:
        xf = float(x)
    except Exception:
        return 0.0
    if xf < 0: return 0.0
    if xf > 1: return 1.0
    return xf

def _safe_collection_name(email: str) -> str:
    """
    Build a per-user collection name for university ranking.
    Example: 'rika@gmail.com' -> 'rikauniranking'
    """
    local = (email or "").split("@")[0]
    alnum = re.sub(r"[^A-Za-z0-9]", "", local)
    prefix = (alnum or "user").lower()
    return f"{prefix}uniranking"

def _get_userinfo(email: str) -> Dict[str, Any]:
    u = users_col.find_one({"email": email})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {"email": email, "prefs": u.get("prefs", {}) or {}}

def _subject_ids_to_names(ids: List[str]) -> List[str]:
    if not ids: return []
    want = [str(x).strip() for x in ids if str(x).strip()]
    if not want: return []
    docs = list(
        unisubjects_col.find(
            {"id": {"$in": want}},
            {"_id": 0, "id": 1, "subjectname": 1, "subject": 1},
        )
    )
    m: Dict[str, str] = {}
    for d in docs:
        sid = str(d.get("id") or "").strip()
        nm = (d.get("subjectname") or d.get("subject") or "").strip()
        if sid and nm:
            m[sid] = nm
    out, seen = [], set()
    for x in want:
        nm = m.get(x)
        if nm and nm not in seen:
            seen.add(nm)
            out.append(nm)
    return out

def _csv_to_set(s: str) -> set[str]:
    return {tok.strip() for tok in (s or "").split(",") if tok and tok.strip()}

def _names_to_set(names: List[str]) -> set[str]:
    return {(nm or "").strip().lower() for nm in (names or []) if (nm or "").strip()}

def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b) or 1
    return inter / union

# ---------- Scoring (Manhattan on scaled numerics + Jaccard on subjects) ----------
def _score_university(
    u: Dict[str, Any],
    pref_countries: List[str],
    pref_subject_ids: List[str],
    pref_subject_names: List[str],
) -> float:
    """
    Hybrid similarity:
      - Numeric similarity (scaled to [0,1]): rank, outlook, country_match (0/1)
      - Subjects Jaccard (IDs if uni Subjects look numeric; else names)
      - Final = 100 * ( ALPHA * numeric + BETA * Jaccard ), with dynamic reweighting
    """

    # ---- Numeric pieces → [0,1] ----
    # Rank (lower is better), 1 - (rank/RANK_CAP)
    rank = _safe_int(u.get("Rank"), 0)
    if rank <= 0:
        rank_score = 0.0
    else:
        rank = min(rank, RANK_CAP)
        rank_score = _clip01(1.0 - (rank / RANK_CAP))

    # Outlook (0..100)
    outlook = _safe_float(u.get("InternationalOutlookScore", u.get("Outlook", 0.0)), 0.0)
    outlook_score = _clip01(outlook / 100.0)

    # Country match (only if user specified countries)
    uni_country = (u.get("Country") or "").strip().lower()
    want_countries = {c.strip().lower() for c in (pref_countries or []) if str(c).strip()}
    country_score = 1.0 if (want_countries and uni_country in want_countries) else 0.0

    # Weighted average of active components
    numeric_sum = 0.0
    numeric_wsum = 0.0
    numeric_sum += W_RANK * rank_score; numeric_wsum += W_RANK
    numeric_sum += W_OUT  * outlook_score; numeric_wsum += W_OUT
    if want_countries:
        numeric_sum += W_COUNTRY * country_score
        numeric_wsum += W_COUNTRY

    numeric_sim = (numeric_sum / numeric_wsum) if numeric_wsum > 0 else 0.0  # in [0,1]

    # ---- Subjects → Jaccard (IDs or names) ----
    subj_raw = str(u.get("Subjects") or "")
    has_digits = any(ch.isdigit() for ch in subj_raw)

    if has_digits and pref_subject_ids:
        uni_set = _csv_to_set(subj_raw)
        user_set = set(pref_subject_ids)
    else:
        # treat as names
        uni_set = _names_to_set([t for t in subj_raw.split(",")]) if subj_raw else set()
        user_set = _names_to_set(_subject_ids_to_names(pref_subject_ids))

    subj_jacc = _jaccard(uni_set, user_set)

    # ---- Final blend with dynamic reweighting ----
    alpha = ALPHA_NUMERIC if numeric_wsum > 0 else 0.0
    beta  = BETA_SUBJECTS if user_set else 0.0
    if alpha + beta == 0:
        return 0.0

    score01 = (alpha * numeric_sim + beta * subj_jacc) / (alpha + beta)
    return round(100.0 * score01, 3)

def _uni_public(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(u.get("_id")),
        "name": u.get("UniversityName"),
        "rank": _safe_int(u.get("Rank"), 0),
        "country": u.get("Country"),
        "students": _safe_int(u.get("NumberOfStudents"), None),
        "international": u.get("InternationalStudents"),
        "image": u.get("ImageUrl"),
        "url": u.get("Website"),
    }

def _has_site(url: Optional[str]) -> bool:
    u = (url or "").strip().lower()
    return u.startswith("http://") or u.startswith("https://")

# ---------- BUILDER ----------
@router.post("/api/matchuni/build")
@router.get("/api/matchuni/build")  # allow GET for quick manual tests
def build_user_ranking(email: str):
    """
    Build (or rebuild) the <localpart>uniranking collection for the given user email.
    Rows: { universityId: <ObjectId>, rank: <float> }
    Always ensures the collection exists.
    """
    uinfo = _get_userinfo(email)
    prefs = uinfo["prefs"] or {}
    pref_countries: List[str] = list(prefs.get("uniPreferredCountries") or [])
    pref_subject_ids: List[str] = [str(x) for x in (prefs.get("uniPreferredSubjectIds") or [])]
    pref_subject_names: List[str] = _subject_ids_to_names(pref_subject_ids)

    coll_name = _safe_collection_name(email)

    # Ensure collection exists
    try:
        if coll_name not in db.list_collection_names():
            db.create_collection(coll_name)
    except CollectionInvalid:
        pass

    ranking_col = db[coll_name]

    ranked: List[Dict[str, Any]] = []

    # Only project fields we actually use for scoring
    PROJ = {
        "_id": 1,
        "UniversityName": 1,
        "Rank": 1,
        "Country": 1,
        "NumberOfStudents": 1,            # not used in score (kept for /results view)
        "InternationalStudents": 1,       # not used in score (kept for /results view)
        "InternationalOutlookScore": 1,
        "Outlook": 1,
        "ImageUrl": 1,                    # used in /results view
        "Website": 1,                     # used in /results view
        "Subjects": 1,
    }

    scanned = 0
    for uni in university_col.find({}, projection=PROJ, batch_size=1000):
        scanned += 1
        score = _score_university(uni, pref_countries, pref_subject_ids, pref_subject_names)
        ranked.append({"universityId": uni["_id"], "rank": score})

    ranked.sort(key=lambda r: r["rank"], reverse=True)

    # Overwrite collection content
    ranking_col.delete_many({})
    if ranked:
        ranking_col.insert_many(ranked)
    else:
        ranking_col.insert_one({
            "_meta": "empty-init",
            "email": email,
            "createdAt": datetime.utcnow(),
        })

    return {
        "ok": True,
        "user": email,
        "collection": coll_name,
        "scanned_universities": scanned,
        "written_rows": len(ranked),
    }

# ---------- READER ----------
@router.get("/api/matchuni/results")
def read_user_ranking(
    email: str,
    min_rank: float = 0,
    limit: int = 50,
    order: str = Query("score", pattern="^(score|rank)$"),  # score | rank
    only_with_site: bool = False,
    max_world_rank: Optional[int] = None,
):
    """
    Read from the per-user <localpart>uniranking collection and return joined university docs.

    Priority order (within the chosen ordering):
      1) User preferred countries FIRST
      2) Has valid Website FIRST
      3) Then 'order=score' → matchScore desc, rank asc
         or  'order=rank'  → rank asc, matchScore desc
    """
    # Load user's preferred countries so we can prioritize them
    uinfo = _get_userinfo(email)
    prefs = uinfo["prefs"] or {}
    want_countries = {str(c).strip().lower() for c in (prefs.get("uniPreferredCountries") or []) if str(c).strip()}

    coll_name = _safe_collection_name(email)
    ranking_col = db[coll_name]

    # Pull a reasonable chunk; we’ll filter/sort in Python then slice to 'limit'
    rows = list(
        ranking_col.find({"rank": {"$gte": float(min_rank)}}, {"_id": 0})
        .sort("rank", -1)
        .limit(500)  # safety cap
    )
    ids = [r.get("universityId") for r in rows if r.get("universityId")]
    if not ids:
        return {"ok": True, "collection": coll_name, "items": []}

    by_id = {u["_id"]: _uni_public(u) for u in university_col.find({"_id": {"$in": ids}})}
    items = []
    for r in rows:
        udoc = by_id.get(r["universityId"])
        if not udoc:
            continue
        items.append({**udoc, "matchScore": r.get("rank", 0)})

    # Optional filters
    if only_with_site:
        items = [it for it in items if _has_site(it.get("url"))]

    if max_world_rank is not None:
        items = [it for it in items if (it.get("rank") or 0) > 0 and it["rank"] <= int(max_world_rank)]

    # Sorting priorities:
    # 1) country preference first
    # 2) has website first
    # 3) selected secondary order
    def country_pref_flag(it):
        c = (it.get("country") or "").strip().lower()
        return (c in want_countries) if want_countries else False

    def site_flag(it):
        return _has_site(it.get("url"))

    BIG = 10**9
    if order == "rank":
        # preferred country → has site → world rank asc → match score desc
        items.sort(key=lambda it: (not country_pref_flag(it),
                                   not site_flag(it),
                                   it.get("rank") or BIG,
                                   -(it.get("matchScore") or 0.0)))
    else:
        # default: preferred country → has site → match score desc → world rank asc
        items.sort(key=lambda it: (not country_pref_flag(it),
                                   not site_flag(it),
                                   -(it.get("matchScore") or 0.0),
                                   it.get("rank") or BIG))

    return {"ok": True, "collection": coll_name, "items": items[: max(1, min(200, limit))]}

# ---------- convenient one-call builder+reader ----------
@router.get("/api/matchuni/build-return")
def build_and_return(email: str, min_rank: float = 0, limit: int = 50,
                     order: str = Query("score", pattern="^(score|rank)$"),
                     only_with_site: bool = False,
                     max_world_rank: Optional[int] = None):
    _ = build_user_ranking(email)
    return read_user_ranking(email, min_rank=min_rank, limit=limit,
                             order=order, only_with_site=only_with_site,
                             max_world_rank=max_world_rank)
