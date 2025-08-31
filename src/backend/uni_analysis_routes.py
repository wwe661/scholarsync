# src/backend/uni_analysis_routes.py
from fastapi import APIRouter, Depends, Request
from typing import List, Dict, Any, Optional,Tuple,Iterable
from pymongo.database import Database
import re


router = APIRouter(prefix="/uni-analysis", tags=["uni-analysis"])

def get_db(request: Request) -> Database:
    return request.app.state.mongo["scholardatas"]

@router.get("/countries")
def uni_countries(db: Database = Depends(get_db)) -> List[Dict[str, Any]]:
    pipe = [
        {"$match": {"Country": {"$type": "string", "$ne": ""}}},  # University collection uses "Country"
        {"$group": {"_id": "$Country", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "label": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
    ]
    return list(db["University"].aggregate(pipe))

@router.get("/top-ranks")
def top_ranks(n: int = 10, db: Database = Depends(get_db)):
    projection = {"_id": 0, "UniversityName": 1, "Rank": 1, "Country": 1}
    docs = db["University"].find({}, projection)

    rows = []
    for d in docs:
        name = (d.get("UniversityName") or "").strip()
        try:
            rank = int(str(d.get("Rank", "")).strip())
        except Exception:
            continue
        if not name or rank <= 0:
            continue
        rows.append({"label": name, "rank": rank, "country": (d.get("Country") or "").strip()})

    rows.sort(key=lambda x: x["rank"])
    return rows[: max(1, min(50, n))]


# --- ADD THIS ENDPOINT ---
def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    if s.startswith("the "):
        s = s[4:]
    s = s.replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "", s)

# simple, readable subject canonicalizer for Program text
_SUBJECT_RULES: List[Tuple[str, str]] = [
    (r"\becon(omics)?\b", "Economics"),
    (r"\bdata\s*science\b", "Data Science"),
    (r"\b(comp(uter)?\s*science|computing\s*science)\b", "Computer Science"),
    (r"\bartificial\s*intelligence|^ai\b", "Artificial Intelligence"),
    (r"\brobot(ic|ics)\b", "Robotics"),
    (r"\bsoftware\s*eng\b|\bsoftware\s*engineering\b", "Software Engineering"),
    (r"\b(business\s*analytics|analytics)\b", "Business Analytics"),
    # add more if you want…
]

def _subject_from_program(p: str) -> str:
    t = (p or "").lower()
    for rx, label in _SUBJECT_RULES:
        if re.search(rx, t):
            return label
    # last-resort fallbacks
    if re.search(r"\b(cs)\b", t): return "Computer Science"
    return (p or "").strip() or "Other"

@router.get("/expensive-tuition")
def expensive_tuition(
    limit: int = 10,
    level: Optional[str] = None,
    country: Optional[str] = None,
    dedupe: str = "uni_subject",  # "uni_subject" | "uni"
    debug: int = 0,
    db: Database = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Top-N tuition entries joined to University rank.
    - `subject` is canonicalized from Program (server-side).
    - `dedupe=uni_subject` keeps one row per (university, subject) with the max tuition.
      `dedupe=uni` keeps a single most-expensive row per university (any subject).
    """
    limit = max(1, min(int(limit), 50))

    # 1) University map for rank join
    uni_rank: Dict[str, Any] = {}
    uni_country: Dict[str, str] = {}
    for u in db["University"].find({}, {"_id": 0, "UniversityName": 1, "Rank": 1, "Country": 1}):
        k = _norm_name(u.get("UniversityName"))
        if k:
            uni_rank[k] = u.get("Rank")
            uni_country[k] = u.get("Country")

    # 2) Pull candidate cost rows
    match: Dict[str, Any] = {}
    if level and level.strip():   match["Level"] = level.strip()
    if country and country.strip(): match["Country"] = country.strip()

    pipe = [
        {"$match": match} if match else {"$match": {}},
        {"$addFields": {
            "tuitionNum": {
                "$cond": [
                    {"$isNumber": "$Tuition_USD"},
                    "$Tuition_USD",
                    {"$convert": {"input": "$Tuition_USD", "to": "double", "onError": None, "onNull": None}}
                ]
            }
        }},
        {"$match": {"tuitionNum": {"$gt": 0}}},
        {"$sort": {"tuitionNum": -1}},
        {"$limit": limit * 40},  # headroom to survive dedupe
        {"$project": {
            "_id": 0,
            "University": 1, "Program": 1, "tuitionNum": 1,
            "Country": 1, "Level": 1
        }},
    ]
    raw = list(db["Cost"].aggregate(pipe))

    # 3) Normalize + join + dedupe
    bucket: Dict[Tuple[str, str], Dict[str, Any]] = {}
    bucket_uni: Dict[str, Dict[str, Any]] = {}

    for r in raw:
        uni = (r.get("University") or "").strip()
        if not uni:
            continue
        key = _norm_name(uni)
        rank = uni_rank.get(key)
        if rank is None:
            continue  # only keep rows we can rank

        tuition = r.get("tuitionNum")
        if tuition is None:
            continue

        program = (r.get("Program") or "").strip()
        subject = _subject_from_program(program)

        row = {
            "university": uni,
            "program": program,
            "subject": subject,       # <= used by UI for color/legend
            "tuition": int(round(tuition)),
            "rank": int(rank) if isinstance(rank, (int, float)) else rank,
            "country": r.get("Country") or uni_country.get(key),
            "level": r.get("Level"),
        }

        if dedupe == "uni":
            # keep ONE row per uni (max tuition)
            if key not in bucket_uni or row["tuition"] > bucket_uni[key]["tuition"]:
                bucket_uni[key] = row
        else:
            # keep ONE row per (uni, subject) (max tuition)
            k = (key, subject)
            if k not in bucket or row["tuition"] > bucket[k]["tuition"]:
                bucket[k] = row

    rows = list(bucket_uni.values()) if dedupe == "uni" else list(bucket.values())
    rows.sort(key=lambda x: x["tuition"], reverse=True)
    rows = rows[:limit]

    if debug:
        rows.append({"_debug": {"returned": len(rows), "dedupe": dedupe}})
    return rows

    # ---------- Rank vs Tuition (scatter) ----------
# --- NEW ENDPOINT: rank vs tuition (joined University + Cost) ---


@router.get("/rank-vs-tuition")
def rank_vs_tuition(
    maxRank: int = 120,
    level: Optional[str] = None,           # "Bachelor" / "Master" (optional)
    country: Optional[str] = None,         # filter, optional
    dedupe: str = "uni_level",             # "none" | "uni_level" | "uni"
    db: Database = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Return rows that exist in BOTH collections:
      - University: UniversityName, Rank, Country
      - Cost: University, Tuition_USD, Level, Country

    Shape:
      [{ rank, tuition, university, country, level }, ...]

    Notes
    - Only keeps universities with a valid positive rank ≤ maxRank.
    - Converts Tuition_USD to a number (handles str/number).
    - Optional filters: level, country
    - Dedupe strategy:
        * uni_level: keep one row per (university, level) => max tuition
        * uni:       keep one row per university          => max tuition
        * none:      keep all matching cost rows
    """

    # 1) Build a normalized map from University -> (rank, country, display name)
    uni_map: Dict[str, Dict[str, Any]] = {}
    uni_q: Dict[str, Any] = {"Rank": {"$type": "number"}}
    # grab only columns we need
    projection = {"_id": 0, "UniversityName": 1, "Rank": 1, "Country": 1}

    for u in db["University"].find(uni_q, projection):
        name_raw = (u.get("UniversityName") or "").strip()
        if not name_raw:
            continue
        # rank must be a positive int
        try:
            rank_val = int(str(u.get("Rank")).strip())
        except Exception:
            continue
        if rank_val <= 0 or (maxRank and rank_val > int(maxRank)):
            continue

        k = _norm_name(name_raw)
        if not k:
            continue

        uni_map[k] = {
            "rank": rank_val,
            "country": (u.get("Country") or "").strip(),
            "name": name_raw,
        }

    if not uni_map:
        return []

    # 2) Pull candidate rows from Cost, convert Tuition_USD to numeric, apply filters
    match: Dict[str, Any] = {}
    if level and level.strip():
        match["Level"] = level.strip()
    if country and country.strip():
        # allow either side (Cost or Univ) to provide country; we'll prefer Univ later
        match["Country"] = country.strip()

    pipe: List[Dict[str, Any]] = []
    pipe.append({"$match": match} if match else {"$match": {}})
    pipe.extend([
        {"$addFields": {
            "tuitionNum": {
                "$cond": [
                    {"$isNumber": "$Tuition_USD"},
                    "$Tuition_USD",
                    {"$convert": {
                        "input": "$Tuition_USD",
                        "to": "double",
                        "onError": None,
                        "onNull": None
                    }}
                ]
            }
        }},
        {"$match": {"tuitionNum": {"$gt": 0}}},
        # keep a generous headroom before dedupe
        {"$project": {
            "_id": 0,
            "University": 1, "Level": 1, "Country": 1,
            "tuitionNum": 1
        }},
    ])

    raw: List[Dict[str, Any]] = list(db["Cost"].aggregate(pipe))
    if not raw:
        return []

    # 3) Join in Python using our normalized key, enforce maxRank
    #    Optional de-duplication by (uni,level) or by uni (keep max tuition).
    keep: List[Dict[str, Any]] = []
    by_uni_level: Dict[tuple, Dict[str, Any]] = {}
    by_uni: Dict[str, Dict[str, Any]] = {}

    for r in raw:
        uni_cost = (r.get("University") or "").strip()
        if not uni_cost:
            continue
        key = _norm_name(uni_cost)
        meta = uni_map.get(key)
        if not meta:
            continue  # skip costs that don't have a ranked university

        row = {
            "rank": meta["rank"],
            "tuition": int(round(r.get("tuitionNum") or 0)),
            "university": meta["name"],    # use canonical display name from University coll
            "country": meta["country"] or (r.get("Country") or "").strip(),
            "level": (r.get("Level") or "").strip() or None,
        }

        if dedupe == "uni_level":
            k = (key, row["level"])
            if k not in by_uni_level or row["tuition"] > by_uni_level[k]["tuition"]:
                by_uni_level[k] = row
        elif dedupe == "uni":
            if key not in by_uni or row["tuition"] > by_uni[key]["tuition"]:
                by_uni[key] = row
        else:
            keep.append(row)

    if dedupe == "uni_level":
        keep = list(by_uni_level.values())
    elif dedupe == "uni":
        keep = list(by_uni.values())

    # 4) Final sort: lower rank first (i.e., more prestigious to the left)
    keep.sort(key=lambda x: (x["rank"], -x["tuition"]))

    return keep
@router.get("/top-subjects")
def top_subjects(n: int = 10, db: Database = Depends(get_db)):
    coll_univ = db["University"]
    coll_sub  = db["Unisubjects"]

    # 1) Build id -> name map from Unisubjects
    subject_map = {}
    for s in coll_sub.find({}, {"_id": 0, "id": 1, "subject": 1}):
        try:
            subject_map[int(s["id"])] = s.get("subject") or f"Unknown ({s['id']})"
        except Exception:
            pass

    # 2) Split University.Subjects string into int array, then count
    pipeline = [
        {"$match": {"Subjects": {"$type": "string", "$ne": ""}}},
        {"$project": {
            "Subjects": {
                "$map": {
                    "input": {"$split": ["$Subjects", ","]},
                    "as": "s",
                    "in": {"$toInt": {"$trim": {"input": "$$s"}}}
                }
            }
        }},
        {"$unwind": "$Subjects"},
        {"$group": {"_id": "$Subjects", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": max(1, min(n, 50))}
    ]

    results = list(coll_univ.aggregate(pipeline))

    # 3) Attach subject names using our map
    out = []
    for r in results:
        sid = int(r["_id"])
        name = subject_map.get(sid, f"Unknown ({sid})")
        out.append({"subject": name, "count": r["count"]})

    return out
@router.get("/university-count")
def university_count(approx: bool = False, db: Database = Depends(get_db)):
    """
    Return the total number of documents in the University collection.
    - Set ?approx=true to use MongoDB's fast estimate (may be off by a little).
    """
    coll = db["University"]
    total = (
        coll.estimated_document_count() if approx else coll.count_documents({})
    )
    return {"total": int(total), "approx": bool(approx)}

