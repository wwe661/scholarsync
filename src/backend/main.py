# --- imports ---
from fastapi_utils.tasks import repeat_every
from bson.objectid import ObjectId
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
#--Notifications--#
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
import os, re
from pymongo import MongoClient
from dotenv import load_dotenv, dotenv_values
from bson import ObjectId
from fastapi import HTTPException
from pydantic import BaseModel
from match import router as match_router
from pydantic import  EmailStr
# in main.py
from pydantic import BaseModel, EmailStr
class UniPrefsIn(BaseModel):
    email: EmailStr
    uniPreferredSubjectIds: List[str] = []
    uniPreferredCountries: List[str] = []



from matchuni import router as matchuni_router
from analysis_routes import router as analysis_router
from uni_analysis_routes import router as uni_analysis_router





# after you create `app = FastAPI()`:







# --- .env loading (robust) ---
CANDIDATES = [
    Path(__file__).with_name(".env"),          # scholarSync/src/backend/.env
    Path(__file__).parents[2] / ".env",        # scholarSync/.env
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

def _redact(uri: str) -> str:
    try:
        u = urlparse(uri)
        host = u.netloc.split("@",1)[-1] if "@" in u.netloc else u.netloc
        return f"{u.scheme}://<user>:<pass>@{host}{u.path}"
    except Exception:
        return "<unparsable>"

print(f"[ENV] loaded from: {loaded_from or '<none>'}")
print(f"[ENV] MONGODB_URI present? {'YES' if MONGODB_URI else 'NO'}")
if MONGODB_URI:
    print(f"[ENV] using: {_redact(MONGODB_URI)}")
else:
    raise RuntimeError("MONGODB_URI missing — put .env in project root or src/backend and restart.")

# --- DB init ---
client = MongoClient(MONGODB_URI)
db = client["scholardatas"]
col = db["scholarships"]

notifications = db["notifications"]
scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    scheduler.add_job(check_deadlines, "cron", hour=8, minute=0)  # run daily at 14:00 UTC
    scheduler.add_job(cleanup_notifications, "cron", hour=3, minute=0)
    scheduler.start()
    print("Scheduler started")
    yield
    # Shutdown
    scheduler.shutdown()
    print("Scheduler stopped")

app = FastAPI(lifespan=lifespan)
# --- create the ASGI app (must be top-level and named `app`) ---
app.state.mongo = client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["*"] to allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(match_router)
app.include_router(matchuni_router)
app.include_router(analysis_router, tags=["analysis"])
# after app = FastAPI(...)
app.include_router(uni_analysis_router)        # ✅ no extra prefix here


# --- CORS ---
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # dev
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# --- helpers ---
def parse_deadline(s: str):
    try:
        return datetime.strptime((s or "").strip(), "%d/%b/%y")
    except:
        return None

def format_deadline_with_month(date_obj: datetime) -> str:
    """
    Convert datetime object -> string in dd/Mon/yy format
    Example: 2025-05-15 -> "15/May/25"
    """
    if isinstance(date_obj, datetime.datetime):
        return date_obj.strftime("%d/%b/%y")
    else: 
        return None

def fields_token_regex(code: str):
    # compiled regex that matches whole token in CSV string:  "14,11,10,..."
    return re.compile(rf"(?:^|,){re.escape((code or '').strip())}(?:,|$)")

def clean_amount(s: str) -> str:
    return (s or "").replace("�", "£").strip()
# --- fields id -> name mapper (lazy, no other code changes needed) ---
FIELDS_MAP: Dict[str, str] = {}

def _get_fields_map() -> Dict[str, str]:
    """Load once from DB the mapping { '1': 'Business Management', ... }"""
    global FIELDS_MAP
    if not FIELDS_MAP:
        try:
            for doc in db["fields"].find({}, {"_id": 0, "id": 1, "name": 1}):
                key = str(doc.get("id"))
                val = (doc.get("name") or "").strip()
                if key and val:
                    FIELDS_MAP[key] = val
        except Exception:
            FIELDS_MAP = {}
    return FIELDS_MAP

def _fields_ids_to_names(raw) -> list[str]:
    """
    Accept '14,11,10' or ['14','11'] or already names; return list of NAMES.
    Keeps order, drops empties.
    """
    if not raw:
        return []
    if isinstance(raw, str):
        tokens = [t.strip() for t in raw.split(",") if t and t.strip()]
    elif isinstance(raw, list):
        tokens = [str(t).strip() for t in raw if str(t).strip()]
    else:
        tokens = []

    fmap = _get_fields_map()
    names = []
    seen = set()
    for tok in tokens:
        name = fmap.get(tok, tok)  # if it's already a name, it will just pass through
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names

# def to_public(d: dict):
#     amount = clean_amount(d.get("amount", ""))
#     if not amount:
#         amount = "Fully Funded"

#     # map stored field IDs -> field names
#     field_names = _fields_ids_to_names(d.get("fields"))

#     return {
#         "id": str(d.get("_id")),
#         "scholarship_name": d.get("scholarship_name"),
#         "provider": d.get("provider"),
#         "country": d.get("country"),
#         "fields": field_names,  # <-- now a list of readable names
#         "level": d.get("level"),
#         "min_gpa": d.get("min_gpa"),
#         "deadline": d.get("deadline"),
#         "deadlineDate": format_deadline_with_month(d.get("deadline", "")),
#         "amount": amount,
#         "type": d.get("type"),
#         "eligibility": d.get("eligibility"),
#         "Egender": d.get("Egender"),
#         "Ecountry": d.get("Ecountry"),
#         "link": d.get("link"),
#     }
def to_public(d: dict):
    amount = clean_amount(d.get("amount", "")) or "Fully Funded"
    field_names = _fields_ids_to_names(d.get("fields"))

    deadline_val = d.get("deadline")
    deadline_dt = None
    deadline_str = None

    if isinstance(deadline_val, datetime.datetime):
        deadline_dt = deadline_val
        deadline_str = deadline_val.strftime("%d/%b/%y")
    elif isinstance(deadline_val, str) and deadline_val.strip().lower() == "no fix":
        deadline_str = "No Fix"

    return {
        "id": str(d.get("_id")),
        "scholarship_name": d.get("scholarship_name"),
        "provider": d.get("provider"),
        "country": d.get("country"),
        "fields": field_names,
        "level": d.get("level"),
        "min_gpa": d.get("min_gpa"),
        "deadline": deadline_dt,        # keep datetime for sorting (None if "No Fix")
        "deadlineDate": deadline_str,   # human readable (or "No Fix")
        "amount": amount,
        "type": d.get("type"),
        "eligibility": d.get("eligibility"),
        "Egender": d.get("Egender"),
        "Ecountry": d.get("Ecountry"),
        "link": d.get("link"),
    }

def csv_token_regex(code: str):
    """Match a whole-number token inside a CSV string, e.g. '28,7,27' matches '7' but not '17'."""
    return re.compile(rf"(?:^|,){re.escape((code or '').strip())}(?:,|$)")

def _to_int_safe(v, default=None):
    try:
        if v is None:
            return default
        if isinstance(v, (int, float)):
            return int(v)
        s = str(v).strip().replace(",", "")
        return int(float(s))
    except Exception:
        return default

def _pct_to_str_keep(v):
    """Return the original percentage string (e.g. '42%') or None if empty/invalid."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None
def _norm_name(s: str) -> str:
    # trim, collapse spaces, lowercase
    return re.sub(r"\s+", " ", (s or "")).strip().lower()
def _uni_to_public(d: dict) -> Dict[str, Any]:
    return {
        "id": str(d.get("_id")),
        "name": d.get("UniversityName"),
        "rank": _to_int_safe(d.get("Rank")),
        "country": d.get("Country"),
        "students": _to_int_safe(d.get("NumberOfStudents")),
        "international": _pct_to_str_keep(d.get("InternationalStudents")),
        "image": d.get("ImageUrl"),
        "url": d.get("Website"),
    }


# --- sanity routes ---
@app.get("/")
def root():
    return {"ok": True, "msg": "API running", "docs": "/docs"}

@app.get("/health")
def health():
    return {"ok": True}

# ---------- SEARCH + PAGINATION (use this from React) ----------
@app.get("/api/scholarships")
def scholarships_search(
    request: Request,
    q: Optional[str] = None,
    level: Optional[List[str]] = Query(default=None),
    fund: Optional[List[str]] = Query(default=None),
    country: Optional[List[str]] = Query(default=None),
    fields: Optional[List[str]] = Query(default=None),
    page: int = 1,
    limit: int = 4,
    sort: Optional[str] = "deadline_asc",
    debug: Optional[int] = 0,
):
    clauses: List[Dict[str, Any]] = []

    # q: OR within group, then AND with others
    if q and q.strip():
        safe = re.escape(q.strip())
        pat = re.compile(f".*{safe}.*", re.IGNORECASE)
        clauses.append({
            "$or": [
                {"scholarship_name": pat},
                {"provider": pat},
                {"country": pat},
                {"type": pat},
                {"level": pat},
            ]
        })

    # level: any selected
    if level:
        clauses.append({"level": {"$in": level}})

    # fund/type: any selected
    if fund:
        clauses.append({"type": {"$in": fund}})

    # country: any selected (case-insensitive exact)
    if country:
        country_or = [
            {"country": re.compile(f"^{re.escape(c.strip())}$", re.IGNORECASE)}
            for c in country if c and c.strip()
        ]
        if country_or:
            clauses.append({"$or": country_or})

    # --- FIELDS: FIXED BLOCK (no nesting under country) ---
    # If no field selected -> skip filtering.
    # If some selected -> include "0" (Any) AND selected IDs, match ANY of them (OR).
    norm_fields = [str(c).strip() for c in (fields or []) if str(c).strip()]
    if norm_fields:
        if "0" not in norm_fields:
            norm_fields.append("0")
        field_or = [{"fields": fields_token_regex(code)} for code in norm_fields]
        clauses.append({"$or": field_or})

    # final query (AND across groups)
    query = {"$and": clauses} if clauses else {}

    total = col.count_documents(query)

    page = max(1, page)
    limit = max(1, min(50, limit))
    skip = (page - 1) * limit

    cursor = col.find(query).skip(skip).limit(limit)
    docs = [to_public(d) for d in cursor]

    if sort == "deadline_asc":
        docs.sort(key=lambda d: (d["deadline"] is None, d["deadline"]))
    elif sort == "deadline_desc":
        docs.sort(key=lambda d: (d["deadline"] is None, d["deadline"]), reverse=True)

    payload = {"total": total, "page": page, "limit": limit, "items": docs}
    if debug:
        payload["debug"] = {"query": str(query), "matched": total}
    return payload


fields_col = db["fields"]

@app.get("/api/fields")
def list_fields():
    # return as [{id: 1, name: "..."}]
    docs = list(fields_col.find({}, {"_id": 0, "id": 1, "name": 1}).sort("id", 1))
    return {"items": docs, "total": len(docs)}

@app.get("/api/countries")
def list_countries():
    # Get unique country values, trim empties, sort
    vals = col.distinct("country")
    items = sorted({(v or "").strip() for v in vals if (v or "").strip()})
    return {"items": list(items), "total": len(items)}

@app.put("/api/users/uniprefs")
def save_uni_prefs(p: UniPrefsIn):
    users_col.update_one(
        {"email": p.email},
        {"$set": {
            "prefs.uniPreferredSubjectIds": [str(x) for x in (p.uniPreferredSubjectIds or [])],
            "prefs.uniPreferredCountries": list(p.uniPreferredCountries or []),
            "prefs.updatedAt": datetime.datetime.utcnow()
        }},
        upsert=True
    )
    return {"ok": True}

@app.get("/api/scholarships/match")
def scholarships_match_proxy(email: str, min_rank: float = 60, page: int = 1, limit: int = 12):
    # reuse the same collections as match.py
    users_col = db["users"]
    user = users_col.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # collection name is "<name>ranking" where name = email prefix (see match.py)
    safe_name = (user.get("name") or email.split("@")[0] or "user")
    safe_name = re.sub(r"[^A-Za-z0-9_-]", "", safe_name) or "user"
    ranking_col = db[f"{safe_name}ranking"]

    rank_docs = list(
        ranking_col.find({"rank": {"$gte": float(min_rank)}}, {"_id": 0, "scholarid": 1, "rank": 1})
    )
    if not rank_docs:
        return {"total": 0, "page": page, "limit": limit, "items": []}

    ids = [rd["scholarid"] if isinstance(rd["scholarid"], ObjectId) else ObjectId(rd["scholarid"]) for rd in rank_docs]
    rank_map = {str(rd["scholarid"]): rd["rank"] for rd in rank_docs}

    cur = col.find({"_id": {"$in": ids}})
    docs = []
    for d in cur:
        docs.append({
            "id": str(d["_id"]),
            "scholarship_name": d.get("scholarship_name"),
            "provider": d.get("provider"),
            "country": d.get("country"),
            "fields": d.get("fields"),
            "level": d.get("level"),
            "deadline": format_deadline_with_month(d.get("deadline")),
            "amount": (d.get("amount") or "").replace("�", "£").strip() or "Fully Funded",
            "type": d.get("type"),
            "link": d.get("link"),
            "rank": rank_map.get(str(d["_id"]), 0),
        })

    docs.sort(key=lambda x: (x.get("rank") is None, x.get("rank", 0)), reverse=True)
    total = len(docs)
    start = max(0, (page - 1) * max(1, min(50, limit)))
    end = start + max(1, min(50, limit))
    return {"total": total, "page": page, "limit": limit, "items": docs[start:end]}

# --- at top with other collections ---
 # your new collection: Country, City, University, ...
# --- cost collection (robust name detection) ---

import re
from fastapi import HTTPException

@app.get("/api/cost/exists")
def cost_exists(name: str):
    """
    Quick check: does a cost row exist for this university name?
    Case-insensitive exact match on the 'University' field.
    """
    if not name.strip():
        raise HTTPException(status_code=400, detail="name required")
    exists = costs_col.count_documents(
        {"University": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}}
    ) > 0
    return {"name": name, "exists": exists}

COST_CANDIDATES = ["cost", "Cost", "costs", "Costs"]
_cost_col_name = None
for _name in COST_CANDIDATES:
    if _name in db.list_collection_names():
        _cost_col_name = _name
        break
costs_col = db[_cost_col_name or "cost"]  # default to "cost" if nothing matched

def _norm_name(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()

def _cost_exists_for(name: str) -> bool:
    """True if there is at least one cost row whose University matches name (case-insensitive)."""
    if not name:
        return False
    try:
        # fast path: anchored case-insensitive regex
        q = {"University": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        return costs_col.count_documents(q, limit=1) > 0
    except Exception:
        # very safe fallback (handles odd whitespace, etc.)
        nm = _norm_name(name)
        for r in costs_col.find({}, {"University": 1}):
            if _norm_name(r.get("University")) == nm:
                return True
        return False

def _cost_public(d: dict) -> dict:
    return {
        "id": str(d.get("_id")),
        "country": d.get("Country"),
        "city": d.get("City"),
        "university": d.get("University"),
        "program": d.get("Program"),
        "level": d.get("Level"),
        "duration_years": d.get("Duration_Years"),
        "tuition_usd": d.get("Tuition_USD"),
        "living_cost_index": d.get("Living_Cost_Index"),
        "rent_usd": d.get("Rent_USD"),
        "visa_fee_usd": d.get("Visa_Fee_USD"),
        "insurance_usd": d.get("Insurance_USD"),
    }
# Get cost row by university name (case-insensitive exact match)
@app.get("/api/cost/by-university")
def cost_by_university(name: str, limit: int = 10):
    """
    Return 1..N cost rows for a university (case-insensitive exact match).
    """
    nm = _norm_name(name)

    # Prefer exact case-insensitive match
    cur = costs_col.find(
        {"University": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        {"_id": 0}
    ).limit(max(1, min(50, limit)))

    rows = list(cur)
    if rows:
        return {"total": len(rows), "items": rows}

    # Fallback: normalized equality (handles extra spaces)
    cur2 = costs_col.find({}, {"_id": 0})
    rows2 = [r for r in cur2 if _norm_name(r.get("University")) == nm]
    if rows2:
        return {"total": len(rows2), "items": rows2[:limit]}

    # Nothing found
    return {"total": 0, "items": []}

users_col = db["users"]

class UserIn(BaseModel):
    username: str = "wild"
    email: EmailStr
    password: str

@app.post("/check-email")
def check_email(user: UserIn):
    """
    Check if the email already exists in the database
    """
    if users_col.find_one({"email": user.email}):
        return {"exists": True}
    return {"exists": False}

@app.post("/signup")
def signup(user: UserIn):
    # Check if email already exists before creating a new user
    if users_col.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already exists")

    # Continue with the rest of the signup process
    today = datetime.datetime.utcnow()

    result = users_col.insert_one({
        "email": user.email,
        "password": user.password,  # (hash in real apps)
        "created_at": today,
        "prefs": {}
    })

    # Create welcome notification
    create_notification(
        mail=user.email,
        type="welcome",
        text=f"Welcome, {user.email}! Your account has been created successfully."
    )

    # Send welcome email
    send_email(
        user.email,
        "Welcome to ScholarApp!",
        f"Welcome, {user.email}! We’re excited to help you find scholarships."
    )
    
    return {"ok": True, "msg": "Signup successful", "email": user.email}

@app.post("/login")
def login(user: UserIn):
    # Check if the email and password match the admin credentials
    if user.email == "admin@gmail.com" and user.password == "Admin@123":
        return {
            "ok": True,
            "msg": "Login successful",
            "email": user.email,
            "user_id": "admin",  # Mark this as an admin user
            "is_admin": True  # Add this flag to identify admin
        }

    # Normal login logic for other users
    found = users_col.find_one({"email": user.email})
    if not found or found.get("password") != user.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return {
        "ok": True,
        "msg": "Login successful",
        "email": user.email,
        "user_id": str(found["_id"]),
        "is_admin": False  # Mark as non-admin for regular users
    }

# in main.py
class PrefsIn(BaseModel):
    email: str
    gender: str
    prefer: str
    level: str
    min_gpa: Optional[float] = None   # <-- NEW
    country: Optional[str] = None          # add
    fieldIds: Optional[List[str]] = None   # add

@app.put("/api/users/preferences")
def save_prefs(p: PrefsIn):
    users_col.update_one(
        {"email": p.email},
        {"$set": {
            "prefs.gender": p.gender,
            "prefs.prefer": p.prefer,
            "prefs.level": p.level,
            "prefs.country": p.country,
            "prefs.fieldIds": p.fieldIds or [],
            "prefs.min_gpa": (p.min_gpa if p.min_gpa is not None else None),  # <-- SAVE IT
            "updatedAt": datetime.datetime.utcnow()
        }},
        upsert=True
    )
    return {"ok": True, "msg": "Preferences saved"}

# import datetime
@app.get("/api/scholarships/near-deadline")
def scholarships_near_deadline(limit: int = 5):
    """
    Get scholarships sorted by deadline closest to now (future only).
    """
    today = datetime.datetime.utcnow()

    # Helper function to parse deadlines safely
    def parse_deadline(deadline_str):
        try:
            return datetime.strptime(deadline_str.strip(), "%d/%b/%y")
        except Exception:
            return None

    # Fetch all scholarships from DB
    docs = list(col.find({}))
    valid_deadlines = []

    for doc in docs:
        d = doc.get("deadline", "")
        if isinstance(d, datetime.datetime) and d > today:  # only future deadlines
            valid_deadlines.append((doc, d))

    # Sort by soonest deadline
    valid_deadlines.sort(key=lambda x: x[1])

    # Limit and format for frontend
    items = []
    for doc, d in valid_deadlines[:limit]:
        items.append({
            "id": str(doc["_id"]),
            "name": doc.get("scholarship_name"),
            "eligibility": doc.get("eligibility"),
            "deadline": format_deadline_with_month(d),
            "type": doc.get("type"),
            "level": doc.get("level"),
            "link": doc.get("link")
        })

    return {"total": len(items), "items": items}

universities_col = db["University"]
def _pct_to_float(x):
    # Accept "42%", "42 %", 42, "42.5%"...
    if x is None:
        return 0.0
    try:
        if isinstance(x, (int, float)):
            return float(x)
        s = str(x).strip().replace(" ", "")
        if s.endswith("%"):
            s = s[:-1]
        return float(s)
    except Exception:
        return 0.0

@app.get("/api/universities/top-international")
def top_universities_by_international(limit: int = 10):
    """
    Return up to `limit` universities sorted by InternationalStudents (desc),
    excluding docs without a valid ImageUrl.
    """
    # Only fetch docs with a non-empty string ImageUrl
    cur = universities_col.find(
        {
            "ImageUrl": {
                "$exists": True,
                "$type": "string",
                "$ne": ""  # not empty
            }
        },
        {
            "_id": 1,
            "UniversityName": 1,
            "InternationalStudents": 1,
            "ImageUrl": 1,
        },
    )

    docs = []
    for d in cur:
        img = (d.get("ImageUrl") or "").strip()
        # Extra safety: ensure it looks like a URL we can render
        if not (img.startswith("http://") or img.startswith("https://")):
            continue

        intl_raw = d.get("InternationalStudents")
        docs.append({
            "id": str(d["_id"]),
            "name": d.get("UniversityName"),
            "international": intl_raw,                              # keep original string e.g. "42%"
            "international_num": _pct_to_float(intl_raw),           # numeric for sorting
            "image": img,
        })

    # Sort by numeric percentage desc
    docs.sort(key=lambda x: (x["international_num"] is None, x["international_num"]), reverse=True)

    # Cap results
    max_len = max(1, min(50, limit))
    docs = docs[:max_len]

    # Remove helper field before returning
    for d in docs:
        d.pop("international_num", None)

    return {"total": len(docs), "uniitems": docs}

@app.get("/api/universities/top")
def top_universities(limit: int = 10):
    """
    Return universities ranked 1..N (default N=10), sorted by Rank asc.
    Fields returned: name, rank, country, students, image, url.
    """
    lim = max(1, min(50, limit))  # safety clamp

    cur = (
        universities_col.find(
            {"Rank": {"$gte": 1, "$lte": 10}},  # rank 1..10
            {
                "_id": 0,
                "UniversityName": 1,
                "Rank": 1,
                "Country": 1,
                "NumberOfStudents": 1,
                "ImageUrl": 1,
                "Website": 1,
            },
        )
        .sort("Rank", 1)
        .limit(lim)
    )

    items = []
    for d in cur:
        items.append({
            "name": d.get("UniversityName"),
            "rank": d.get("Rank"),
            "country": d.get("Country"),
            "students": d.get("NumberOfStudents"),
            "image": d.get("ImageUrl"),
            "url": d.get("Website"),
        })

    return {"total": len(items), "items": items}
@app.get("/api/universities/countries")
def uni_countries():
    vals = universities_col.distinct("Country")
    items = sorted({(v or "").strip() for v in vals if (v or "").strip()})
    return {"items": list(items), "total": len(items)}

@app.get("/api/unisubjects")
def list_unisubjects():
    cur = db["Unisubjects"].find({}, {"_id": 0, "id": 1, "subject": 1, "subjectname": 1}).sort("id", 1)
    items = []
    for d in cur:
        items.append({
            "id": d.get("id"),
            "subject": d.get("subject"),
            "subjectname": d.get("subjectname") or d.get("subject"),
        })
    return {"items": items, "total": len(items)}
@app.get("/api/universities/search")
def universities_search(
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 6,
    rank_min: Optional[int] = 1,
    rank_max: Optional[int] = 2000,
    subject: Optional[List[str]] = Query(default=None),  # ?subject=1&subject=7 ...
):
    clauses: List[Dict[str, Any]] = []

    # q across UniversityName / Country
    if q and q.strip():
        safe = re.escape(q.strip())
        pat = re.compile(f".*{safe}.*", re.IGNORECASE)
        clauses.append({
            "$or": [
                {"UniversityName": pat},
                {"Country": pat},
            ]
        })

    # rank range
    rmin = _to_int_safe(rank_min, 1)
    rmax = _to_int_safe(rank_max, 2000)
    if rmin is not None and rmax is not None and rmin > rmax:
        rmin, rmax = rmax, rmin
    rank_sub: Dict[str, Any] = {}
    if rmin is not None: rank_sub["$gte"] = rmin
    if rmax is not None: rank_sub["$lte"] = rmax
    if rank_sub:
        clauses.append({"Rank": rank_sub})

    # subjects: OR across provided IDs, whole-token against CSV string "Subjects"
    def csv_token_regex(code: str):
        return re.compile(rf"(?:^|,){re.escape((code or '').strip())}(?:,|$)")
    subj_ids = [str(s).strip() for s in (subject or []) if str(s).strip()]
    if subj_ids:
        clauses.append({"$or": [{"Subjects": csv_token_regex(code)} for code in subj_ids]})

    query = {"$and": clauses} if clauses else {}
    total = universities_col.count_documents(query)

    page  = max(1, int(page))
    limit = max(1, min(50, int(limit)))
    skip  = (page - 1) * limit

    proj = {
        "UniversityName": 1, "Rank": 1, "Country": 1,
        "NumberOfStudents": 1, "InternationalStudents": 1,
        "Website": 1, "ImageUrl": 1,
    }

    cursor = (
        universities_col.find(query, proj)
        .sort([("Rank", 1)])
        .skip(skip)
        .limit(limit)
    )

    items = []
    for d in cursor:
        pub = _uni_to_public(d)  # your existing formatter
        uni_name = (pub.get("name") or "").strip()
        # **Key line**: case-insensitive EXACT match against cost.University
        pub["hasCost"] = bool(
            uni_name and costs_col.count_documents(
                {"University": {"$regex": f"^{re.escape(uni_name)}$", "$options": "i"}}
            ) > 0
        )
        items.append(pub)

    return {"total": total, "page": page, "limit": limit, "items": items}



### NOTIFICATIONS ####

# @app.on_event("startup")
# @repeat_every(seconds=86400)  # once per day

@app.get('/api/notification/unread')
def get_unread_notifications(mail: str):
    """
    Get unread notifications for a user.
    """
    docs = notifications.find({"mail": mail, "read": False}).sort("created_at", -1)
    
    result = []
    for d in docs:
        result.append({
            "id": str(d.get("_id", "")),  # Convert ObjectId -> string
            "mail": d.get("mail"),
            "type": d.get("type"),
            "text": d.get("text"),
            "created_at": d.get("created_at").isoformat() if d.get("created_at") else None,
            "read": d.get("read", False)
        })

    return {"notifications": result}
from fastapi import Body

@app.post('/api/notification/mark-read')
def mark_notifications_as_read(mail: str = Body(..., embed=True)):
    """
    Mark all unread notifications for a user as read.
    """
    result = notifications.update_many(
        {"mail": mail, "read": False},
        {"$set": {"read": True}}
    )
    return {
        "ok": True,
        "matched": result.matched_count,
        "modified": result.modified_count
    }

import datetime
def check_deadlines():
    now = datetime.utcnow()
    today = now.date()
    
    # run only if 2 PM UTC (or adjust timezone)
    if now.hour == 14:
        today = datetime.now()
        next_7_days = today + timedelta(days=7)

        upcoming = col.find({
            "deadline": {"$gte": today, "$lte": next_7_days}
        }).sort("deadline", 1).limit(3)
        scholars = [i['scholarship_name'] for i in upcoming]    
        if scholars.__len__() > 0 :
            for user in users_col.find():
                text = ", ".join(scholars)
                create_notification(
                    user["email"], "deadline_reminder",
                    f"Reminder: These scholarships are due within 7 days: {text}"
                )
                send_email(user["email"], "Scholarship Deadlines", f"Closing today: {text}")

def create_notification(mail, type, text):
    print("noti create", mail, type, text)
    notifications.insert_one({
        "mail": mail,
        "type": type,
        "text": text,
        "created_at": datetime.datetime.utcnow(),
        "read": False
    })

def cleanup_notifications(days: int = 7):
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = notifications.delete_many({
        "read": True,
        "created_at": {"$lt": cutoff}
    })
    print(f"[Cleanup] Deleted {result.deleted_count} old notifications")
    
@app.delete("/api/notification/cleanup")
def manual_cleanup(days: int = 7):
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = notifications.delete_many({
        "read": True,
        "created_at": {"$lt": cutoff}
    })
    return {"ok": True, "deleted": result.deleted_count}

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to_email, subject, body):
    print('mailing')
    from_email = "wwewinter661@gmail.com"
    password = "hohg sbdr phld touc"  # use app password for Gmail

    # Create the email
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    # Connect to Gmail SMTP server
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(from_email, password)
    server.send_message(msg)
    server.quit()

    print(f"Email sent to {to_email}")
    # Plug in SMTP or SendGrid here
    print(f"Sending email -> {to_email}: {subject} - {body}")


