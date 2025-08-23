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

# ---- ENV & DB ----
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

# ---- helpers ----
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

def _csv_token_regex(code: str):
    c = (code or "").strip()
    return re.compile(rf"(?:^|,){re.escape(c)}(?:,|$)")

def _safe_collection_name(email: str) -> str:
    """
    First 2 alphanumeric chars of the email's local-part + 'ranking'.
    'rika@gmail.com' -> 'riranking'
    """
    local = (email or "").split("@")[0]
    alnum = re.sub(r"[^A-Za-z0-9]", "", local)
    prefix = (alnum[:2] or "us").lower()
    return f"{prefix}ranking"

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

def _score_university(
    u: Dict[str, Any],
    pref_countries: List[str],
    pref_subject_ids: List[str],
    pref_subject_names: List[str],
) -> float:
    """
    +20 if Country matches any preferred
    +20 if Rank <= 10 else +10
    +20 if Outlook >= 80 else +10  (InternationalOutlookScore or Outlook)
    + up to 40 for subjects (evenly distributed):
        - If University.Subjects looks like numeric CSV, whole-token match by ID
        - Else fallback to case-insensitive name containment
    """
    score = 0.0

    # Country
    country = (u.get("Country") or "").strip()
    if pref_countries:
        want = {c.lower().strip() for c in pref_countries if c and str(c).strip()}
        if country.lower() in want:
            score += 20

    # Rank
    unirank = _safe_int(u.get("Rank"), 0)
    score += 20 if (unirank and unirank <= 10) else 10

    # Outlook
    outlook = _safe_float(u.get("InternationalOutlookScore", u.get("Outlook", 0)), 0.0)
    score += 20 if outlook >= 80 else 10

    # Subjects
    total_points = 40.0
    subj_raw = str(u.get("Subjects") or "")
    looks_like_ids = bool(re.search(r"\d", subj_raw))  # works for "28,7,27,..."

    if looks_like_ids and pref_subject_ids:
        n = len(pref_subject_ids)
        per = total_points / float(n)
        for sid in pref_subject_ids:
            if _csv_token_regex(sid).search(subj_raw):
                score += per
    else:
        n = len(pref_subject_names)
        if n > 0:
            per = total_points / float(n)
            blob = subj_raw.lower()
            for nm in pref_subject_names:
                name = (nm or "").strip().lower()
                if name and name in blob:
                    score += per

    return round(score, 3)

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

# ---------- BUILDER ----------
@router.post("/api/matchuni/build")
@router.get("/api/matchuni/build")  # allow GET for quick manual tests
def build_user_ranking(email: str):
    """
    Build (or rebuild) the <first2letters>ranking collection for the given user email.
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
    cur = university_col.find(
        {},
        {
            "_id": 1,
            "UniversityName": 1,
            "Rank": 1,
            "Country": 1,
            "NumberOfStudents": 1,
            "InternationalStudents": 1,
            "InternationalOutlookScore": 1,
            "ImageUrl": 1,
            "Website": 1,
            "Subjects": 1,
        },
    )
    scanned = 0
    for uni in cur:
        scanned += 1
        score = _score_university(uni, pref_countries, pref_subject_ids, pref_subject_names)
        ranked.append({"universityId": uni["_id"], "rank": score})

    ranked.sort(key=lambda r: r["rank"], reverse=True)

    # Overwrite collection content
    ranking_col.delete_many({})
    if ranked:
        ranking_col.insert_many(ranked)
    else:
        # placeholder so Atlas shows the collection
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
def read_user_ranking(email: str, min_rank: float = 0, limit: int = 50):
    """
    Read from the per-user <first2letters>ranking collection and return joined university docs.
    """
    coll_name = _safe_collection_name(email)
    ranking_col = db[coll_name]

    rows = list(
        ranking_col.find({"rank": {"$gte": float(min_rank)}}, {"_id": 0})
        .sort("rank", -1)
        .limit(max(1, min(200, limit)))
    )
    ids = [r.get("universityId") for r in rows if r.get("universityId")]
    if not ids:
        return {"ok": True, "collection": coll_name, "items": []}

    by_id = {u["_id"]: _uni_public(u) for u in university_col.find({"_id": {"$in": ids}})}
    items = []
    for r in rows:
        u = by_id.get(r["universityId"])
        if not u:
            continue
        items.append({**u, "matchScore": r.get("rank", 0)})

    return {"ok": True, "collection": coll_name, "items": items}

# ---------- convenient one-call builder+reader ----------
@router.get("/api/matchuni/build-return")
def build_and_return(email: str, min_rank: float = 0, limit: int = 50):
    _ = build_user_ranking(email)
    return read_user_ranking(email, min_rank=min_rank, limit=limit)
