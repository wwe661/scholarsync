# --- imports ---
from bson.errors import InvalidId
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
from datetime import datetime

# in main.py
from pydantic import BaseModel, EmailStr

# 🔹 Added for profile/avatar
from fastapi import UploadFile, File, Body
from fastapi.staticfiles import StaticFiles

class UniPrefsIn(BaseModel):
    email: EmailStr
    uniPreferredSubjectIds: List[str] = []
    uniPreferredCountries: List[str] = []

from passlib.hash import bcrypt   

from matchuni import router as matchuni_router
from analysis_routes import router as analysis_router
from uni_analysis_routes import router as uni_analysis_router

from admin_profile import router as admin_profile_router



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

CHECK_DEADLINE_HOUR = int(os.getenv("CHECK_DEADLINE_HOUR", 8))
CHECK_DEADLINE_MINUTE = int(os.getenv("CHECK_DEADLINE_MINUTE", 0))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    
    scheduler.add_job(check_deadlines, "cron",
    hour=CHECK_DEADLINE_HOUR,
    minute=CHECK_DEADLINE_MINUTE)  # run daily at 14:00 UTC
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
    allow_origins=["*"],  # Only allow requests from this specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 🔹 Static files for avatar uploads (added)
BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "static"
AVATAR_DIR = ASSETS_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(ASSETS_DIR)), name="static")

app.include_router(match_router)
app.include_router(matchuni_router)
app.include_router(analysis_router, tags=["analysis"])
# after app = FastAPI(...)
app.include_router(uni_analysis_router)        # ✅ no extra prefix here
app.include_router(admin_profile_router)

# --- CORS ---
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # dev
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )
# core collections
col = db["scholarships"]
notifications = db["notifications"]
fields_col = db["fields"]
universities_col = db["University"]
users_col = db["users"]

# aliases for admin compatibility
unis_col = universities_col
unisubjects_col = db["Unisubjects"]

# detect costs collection robustly
COST_CANDIDATES = ["cost", "Cost", "costs", "Costs"]
_cost_col_name = None
for _name in COST_CANDIDATES:
    if _name in db.list_collection_names():
        _cost_col_name = _name
        break
costs_col = db[_cost_col_name or "cost"]  # fallback to "cost"
cost_col = costs_col  # alias for admin routes
# --- helpers ---
def parse_deadline(s: str):
    try:
        return datetime.strptime((s or "").strip(), "%d/%b/%y")
    except:
        return None

def format_deadline_with_month(date_obj: datetime) -> str:
    """
    Convert datetime object -> string in dd/Mon/yy format.
    Example: 2025-05-15 -> "15/May/25"
    """
    if isinstance(date_obj, datetime):  # Use `datetime` directly
        return date_obj.strftime("%d/%b/%y")  # Format the date into dd/Mon/yy
    else: 
        return None  # Return None if not a valid datetime object
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
def to_public(d: dict):
    amount = clean_amount(d.get("amount", "")) or "Fully Funded"
    field_names = _fields_ids_to_names(d.get("fields"))

    deadline_val = d.get("deadline")
    deadline_dt = None
    deadline_str = None

    # Check if `deadline_val` is a datetime object (from the datetime module)
    if isinstance(deadline_val, datetime):
        deadline_dt = deadline_val
        deadline_str = deadline_val.strftime("%d/%b/%y")  # Format it into a readable string
    elif isinstance(deadline_val, str) and deadline_val.strip().lower() == "no fix":
        deadline_str = "No Fix"  # Handle "No Fix" case

    return {
        "id": str(d.get("_id")),  # Ensure _id is properly converted to string
        "scholarship_name": d.get("scholarship_name"),
        "provider": d.get("provider"),
        "country": d.get("country"),
        "fields": field_names,
        "level": d.get("level"),
        "min_gpa": d.get("min_gpa"),
        "deadline": deadline_dt,        # Keep the datetime object for sorting
        "deadlineDate": deadline_str,   # Human-readable deadline string (or "No Fix")
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

# 🔹 helper for id parsing (added)
def _oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

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
            "prefs.updatedAt": datetime.utcnow()
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

# 🔹 Profile models & endpoints (added)
class UserProfileIn(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr] = None
    profilePic: Optional[str] = None
    password: Optional[str] = None  # demo only

@app.get("/users/{user_id}")
def get_user(user_id: str):
    if user_id == "admin":
        raise HTTPException(status_code=404, detail="Admin profile not editable")
    doc = users_col.find_one({"_id": _oid(user_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(doc["_id"]),
        "firstName": doc.get("firstName") or doc.get("username") or "",
        "lastName": doc.get("lastName") or "",
        "email": doc.get("email") or "",
        "profilePic": doc.get("profilePic") or "",
        "password": doc.get("password") or "",  # WARNING: demo only
    }

@app.get("/users/by-email")
def get_user_by_email(email: EmailStr):
    doc = users_col.find_one({"email": str(email)})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(doc["_id"]),
        "firstName": doc.get("firstName") or doc.get("username") or "",
        "lastName": doc.get("lastName") or "",
        "email": doc.get("email") or "",
        "profilePic": doc.get("profilePic") or "",
    }

@app.put("/users/{user_id}")
def update_user(user_id: str, payload: UserProfileIn):
    if user_id == "admin":
        raise HTTPException(status_code=400, detail="Admin profile not editable")
    oid = _oid(user_id)
    doc = users_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    updates: Dict[str, Any] = {}

    # Email change → enforce uniqueness
    if payload.email and payload.email != doc.get("email"):
        if users_col.find_one({"email": payload.email, "_id": {"$ne": oid}}):
            raise HTTPException(status_code=400, detail="Email already exists")
        updates["email"] = str(payload.email)

    if payload.firstName is not None: updates["firstName"] = payload.firstName
    if payload.lastName  is not None: updates["lastName"]  = payload.lastName
    if payload.profilePic is not None: updates["profilePic"] = payload.profilePic
    if payload.password: updates["password"] = payload.password  # demo only

    if updates:
        updates["updated_at"] = datetime.utcnow()
        users_col.update_one({"_id": oid}, {"$set": updates})

    new_doc = users_col.find_one({"_id": oid})
    return {
        "ok": True,
        "user": {
            "id": user_id,
            "firstName": new_doc.get("firstName") or "",
            "lastName": new_doc.get("lastName") or "",
            "email": new_doc.get("email") or "",
            "profilePic": new_doc.get("profilePic") or "",
        }
    }

class PasswordChangeIn(BaseModel):
    currentPassword: str
    newPassword: str

@app.put("/users/{user_id}/password")
def change_password(user_id: str, body: PasswordChangeIn):
    if user_id == "admin":
        raise HTTPException(status_code=400, detail="Admin profile not editable")
    oid = _oid(user_id)
    doc = users_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    if (doc.get("password") or "") != body.currentPassword:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    users_col.update_one({"_id": oid}, {"$set": {"password": body.newPassword, "updated_at": datetime.utcnow()}})
    return {"ok": True, "msg": "Password updated"}

@app.post("/upload/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...)):
    ct = (file.content_type or "").lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    data = await file.read()
    max_bytes = 5 * 1024 * 1024  # 5 MB
    if len(data) > max_bytes:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")

    ext = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
    }.get(ct, "bin")

    filename = f"{ObjectId()}.{ext}"
    filepath = AVATAR_DIR / filename
    with open(filepath, "wb") as f:
        f.write(data)

    base = str(request.base_url).rstrip("/")
    url = f"{base}/static/avatars/{filename}"
    return {"url": url}

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
    # Block duplicate emails
    if users_col.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already exists")

    today = datetime.utcnow()

    # Create user with empty profilePic => navbar falls back to initial letter
    doc = {
        "email": user.email,
        "password": user.password,   # (hash in real apps)
        "created_at": today,
        "prefs": {},
        "firstName": "",
        "lastName": "",
        "profilePic": ""             # <-- important for initial-letter avatar
    }
    result = users_col.insert_one(doc)

    name = user.email.split("@")[0]

    # Notification
    create_notification(
        mail=user.email,
        type="welcome",
        text=f"Welcome, {name}! Your account has been created successfully."
    )

    # Welcome email (HTML)
    welcome_html = """
    <html>
    <body style="font-family: Arial; background:#f4f4f4; padding:20px;">
        <div style="max-width:600px;margin:auto;background:white;padding:20px;border-radius:8px;">
        <h2 style="color:#254085;">🎉 Welcome to Our System!</h2>
        <p>Hi <b>""" + name + """</b>,</p>
        <p>We’re excited to have you onboard 🚀</p>
        <a href="http://172.20.1.227:5173/"
           style="display:inline-block;background:#254085;color:white;padding:12px 20px;
                  text-decoration:none;border-radius:5px;margin-top:20px;">
           Get Started
        </a>
        <p style="margin-top:30px;">Cheers,<br> ScholarSync Team </p>
        </div>
    </body>
    </html>
    """
    send_email(
        user.email,
        "Welcome to ScholarApp!",
        welcome_html
    )

    # ✅ Return user_id so frontend can persist it (fixes redirect to /authpage)
    return {
        "ok": True,
        "msg": "Signup successful",
        "email": user.email,
        "user_id": str(result.inserted_id)
    }

@app.post("/login")
def login(user: UserIn):
    u = users_col.find_one({"email": user.email})
    if not u:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored = (u.get("password") or "")
    if stored.startswith("$2b$"):              # bcrypt hash stored
        ok = bcrypt.verify(user.password, stored)
    else:                                      # legacy plaintext
        ok = (user.password == stored)

    if not ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "ok": True,
        "msg": "Login successful",
        "email": u["email"],
        "user_id": str(u["_id"]),
        "is_admin": bool(u.get("role") == "admin"),
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
            "updatedAt": datetime.utcnow()
        }},
        upsert=True
    )
    return {"ok": True, "msg": "Preferences saved"}

from datetime import datetime  # Correctly import the datetime class

@app.get("/api/scholarships/near-deadline")
def scholarships_near_deadline(limit: int = 5):
    """
    Get scholarships sorted by deadline closest to now (future only).
    """
    today = datetime.utcnow()  # Use the `datetime` class here.

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
        if isinstance(d, datetime) and d > today:  # Use `datetime` directly
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
            "Website": 1,
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
             "url": d.get("Website"),
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

# import datetime
def check_deadlines():
    now = datetime.utcnow()
    today = now.date()
    
    # run only if 2 PM UTC (or adjust timezone)
    today = datetime.now()
    next_30_days = today + timedelta(days=30)

    upcoming = col.find({
        "deadline": {"$gte": today, "$lte": next_30_days}
    }).sort("deadline", 1).limit(3)
    scholars = []
    for i in upcoming:
        duein = (i["deadline"].date() - today.date()).days
        scholars.append(f"{i['scholarship_name']} ( due in {duein} days)") 
    
    
    if scholars.__len__() > 0 :
        for i in scholars:
            scholars_text = "<li><b> "+i+" </b></li>"
        for user in users_col.find():
            name = user.get("email").split("@")[0]
            text = ", ".join(scholars)
            
            reminder_html = """
            <html>
            <body style="font-family: Arial; background:#f9f9f9; padding:20px;">
                <div style="max-width:600px;margin:auto;background:white;padding:20px;border-radius:8px;">
                <h2 style="color:#e74c3c;">⏰ Upcoming Deadlines</h2>
                <p>Hello <b>"""+ name +"""</b>,</p>
                <p>The following Scholars are due soon:</p>
                <ul>"""+scholars_text+"""
                </ul>
                <a href="http://172.20.1.227:5173/" 
                    style="display:inline-block;background:#e74c3c;color:white;padding:12px 20px;
                            text-decoration:none;border-radius:5px;margin-top:20px;">
                    View Website to change detail
                </a>
                <p style="margin-top:30px;">Best,<br>ScholarSync</p>
                </div>
            </body>
            </html>
            """ 
            create_notification(
                user["email"], "deadline_reminder",
                f"Reminder: These scholarships are due within 7 days: {text}"
            )
            send_email(user["email"], "Scholarship Deadlines", reminder_html)

def create_notification(mail, type, text):
    print("noti create", mail, type, text)
    notifications.insert_one({
        "mail": mail,
        "type": type,
        "text": text,
        "created_at": datetime.utcnow(),
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

def send_email(to_email, subject, body_html, body_text="This email requires an HTML-compatible client."):
    print('mailing')
    from_email = "educompassmyanmar@gmail.com"
    password = "jwpv shwe cqnh zatb"  # Gmail app password

    # Create the email
    msg = MIMEMultipart("alternative")
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject

    # Attach plain-text and HTML versions
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    # Connect to Gmail SMTP server
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(from_email, password)
    server.send_message(msg)
    server.quit()

    print(f"Email sent to {to_email}")
    # Plug in SMTP or SendGrid here
    #print(f"Sending email -> {to_email}: {subject} - {body}")

# --- Admin routes ---
# USERS
@app.get("/admin/users")
def admin_get_users():
    users = list(users_col.find({}, {"_id": 1, "email": 1, "created_at": 1}))
    for u in users:
        u["_id"] = str(u["_id"])
        # Convert datetime to ISO string for frontend
        u["created_at"] = u.get("created_at").isoformat() if u.get("created_at") else None
        # u["updatedAt"] = u.get("updatedAt").isoformat() if u.get("updatedAt") else None
    return {"items": users, "total": len(users)}



def _collection_name_for_user(email: str) -> str:
    """
    Name pattern: "<safeDisplayName>ranking"
    """
    local = (email or "").split("@")[0]
    alnum = re.sub(r"[^A-Za-z0-9]", "", local)
    prefix = (alnum or "user").lower()
    return f"{prefix}ranking"


def _safe_collection_name(email: str) -> str:
    """
    Build a per-user collection name for university ranking.
    Example: 'rika@gmail.com' -> 'rikauniranking'
    """
    local = (email or "").split("@")[0]
    alnum = re.sub(r"[^A-Za-z0-9]", "", local)
    prefix = (alnum or "user").lower()
    return f"{prefix}uniranking"



@app.delete("/admin/users/{user_id}")

def delete_user(user_id: str):
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid user ID: {user_id}")
    
    user = users_col.find_one({"_id": oid}, {"email": 1, "_id": 0})
    if not user or "email" not in user:
        raise HTTPException(status_code=404, detail="User not found")
    
    email = user["email"]

    # Delete notifications
    notifications.delete_many({"mail": email})
    
    # Drop user-specific collections
    scholarcolname = _collection_name_for_user(email)
    print(scholarcolname)
    db.drop_collection(scholarcolname)
    
    unicolname = _safe_collection_name(email)
    print(unicolname)
    db.drop_collection(unicolname)
    
    # Delete user record
    result = users_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found in collection")

    return {"ok": True, "msg": f"User {email} deleted"}


# SCHOLARSHIPS
# --- SCHOLARSHIPS ---
@app.get("/admin/scholarships/{scholar_id}")
def get_scholarship(scholar_id: str):
    try:
        oid = ObjectId(scholar_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid scholarship ID")
   
    scholarship = col.find_one({"_id": oid})
    if not scholarship:
        raise HTTPException(status_code=404, detail="Scholarship not found")
   
    # convert _id to string for frontend
    scholarship["_id"] = str(scholarship["_id"])
    return {"ok": True, "item": scholarship}


# --- Admin Scholarships List ---
@app.get("/admin/scholarships")
def admin_get_scholarships():
    scholarships = list(col.find({}))  # <-- no projection
    for s in scholarships:
        s["_id"] = str(s["_id"])
    return {"items": scholarships, "total": len(scholarships)}




@app.put("/admin/scholarships/{scholar_id}")
def update_scholarship(scholar_id: str, data: dict = Body(...)):
    try:
        oid = ObjectId(scholar_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid scholarship ID")


    update_data = {k: v for k, v in data.items() if k not in ["_id", "id"]}
    result = col.update_one({"_id": oid}, {"$set": update_data})


    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Scholarship not found")


    # Return updated document
    updated = col.find_one({"_id": oid})
    updated["_id"] = str(updated["_id"])
    return {"ok": True, "msg": "Scholarship updated", "item": updated}


@app.delete("/admin/scholarships/{scholar_id}")
def delete_scholarship(scholar_id: str):
    try:
        oid = ObjectId(scholar_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid scholarship ID: {scholar_id}")
    result = col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scholarship not found")
    return {"ok": True, "msg": "Scholarship deleted"}




# --- ADD SCHOLARSHIP ---
@app.post("/admin/scholarships")
def add_scholarship(data: dict = Body(...)):
    # Remove _id if frontend accidentally sends one
    data.pop("_id", None)


    # Insert into MongoDB
    result = col.insert_one(data)


    # Fetch inserted document
    new_doc = col.find_one({"_id": result.inserted_id})
    new_doc["_id"] = str(new_doc["_id"])


    return new_doc




# UNIVERSITIES
@app.get("/admin/universities/{uni_id}")
def get_university(uni_id: str):
    try:
        oid = ObjectId(uni_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid university ID")
   
    uni = unis_col.find_one({"_id": oid})
    if not uni:
        raise HTTPException(status_code=404, detail="University not found")


    # Convert ObjectId to string
    uni["_id"] = str(uni["_id"])
    return {"ok": True, "item": uni}
# --- Admin Universities List ---
@app.get("/admin/universities")
def admin_get_universities():
    unis = list(unis_col.find({}))  # no projection
    for u in unis:
        u["_id"] = str(u["_id"])
    return {"items": unis, "total": len(unis)}




@app.put("/admin/universities/{uni_id}")
def update_university(uni_id: str, data: dict = Body(...)):
    try:
        oid = ObjectId(uni_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid university ID")


    update_data = {k: v for k, v in data.items() if k not in ["_id", "id"]}
    result = unis_col.update_one({"_id": oid}, {"$set": update_data})


    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="University not found")


    updated = unis_col.find_one({"_id": oid})
    updated["_id"] = str(updated["_id"])
    return {"ok": True, "msg": "University updated", "item": updated}
@app.delete("/admin/universities/{uni_id}")
def delete_university(uni_id: str):
    try:
        oid = ObjectId(uni_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid university ID: {uni_id}")
    result = unis_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="University not found")
    return {"ok": True, "msg": "University deleted"}


# --- ADD UNIVERSITY ---
@app.post("/admin/universities")
def add_university(data: dict = Body(...)):
    data.pop("_id", None)


    result = unis_col.insert_one(data)


    new_doc = unis_col.find_one({"_id": result.inserted_id})
    new_doc["_id"] = str(new_doc["_id"])


    return new_doc




# --- Admin Fields ---
@app.get("/admin/fields")
def admin_get_fields():
    fields = list(fields_col.find({}))
    for f in fields:
        f["_id"] = str(f["_id"])
    return {"items": fields, "total": len(fields)}


@app.get("/admin/fields/{field_id}")
def get_field(field_id: str):
    try:
        oid = ObjectId(field_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid field ID")
    field = fields_col.find_one({"_id": oid})
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    field["_id"] = str(field["_id"])
    return {"ok": True, "item": field}


@app.post("/admin/fields")
def add_field(data: dict = Body(...)):
    data.pop("_id", None)
    result = fields_col.insert_one(data)
    new_doc = fields_col.find_one({"_id": result.inserted_id})
    new_doc["_id"] = str(new_doc["_id"])
    return new_doc


@app.put("/admin/fields/{field_id}")
def update_field(field_id: str, data: dict = Body(...)):
    try:
        oid = ObjectId(field_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid field ID")
    update_data = {k: v for k, v in data.items() if k != "_id"}
    result = fields_col.update_one({"_id": oid}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Field not found")
    updated = fields_col.find_one({"_id": oid})
    updated["_id"] = str(updated["_id"])
    return {"ok": True, "msg": "Field updated", "item": updated}


@app.delete("/admin/fields/{field_id}")
def delete_field(field_id: str):
    try:
        oid = ObjectId(field_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid field ID: {field_id}")
    result = fields_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Field not found")
    return {"ok": True, "msg": "Field deleted"}


# --- Admin UniSubjects ---
@app.get("/admin/unisubjects")
def admin_get_unisubjects():
    subs = list(unisubjects_col.find({}))
    for s in subs:
        s["_id"] = str(s["_id"])
    return {"items": subs, "total": len(subs)}


@app.get("/admin/unisubjects/{sub_id}")
def get_unisubject(sub_id: str):
    try:
        oid = ObjectId(sub_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid subject ID")
    sub = unisubjects_col.find_one({"_id": oid})
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")
    sub["_id"] = str(sub["_id"])
    return {"ok": True, "item": sub}


@app.post("/admin/unisubjects")
def add_unisubject(data: dict = Body(...)):
    data.pop("_id", None)
    result = unisubjects_col.insert_one(data)
    new_doc = unisubjects_col.find_one({"_id": result.inserted_id})
    new_doc["_id"] = str(new_doc["_id"])
    return new_doc


@app.put("/admin/unisubjects/{sub_id}")
def update_unisubject(sub_id: str, data: dict = Body(...)):
    try:
        oid = ObjectId(sub_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid subject ID")
    update_data = {k: v for k, v in data.items() if k != "_id"}
    result = unisubjects_col.update_one({"_id": oid}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    updated = unisubjects_col.find_one({"_id": oid})
    updated["_id"] = str(updated["_id"])
    return {"ok": True, "msg": "Subject updated", "item": updated}


@app.delete("/admin/unisubjects/{sub_id}")
def delete_unisubject(sub_id: str):
    try:
        oid = ObjectId(sub_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid subject ID: {sub_id}")
    result = unisubjects_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"ok": True, "msg": "Subject deleted"}




# --- Admin Cost ---
# --- Admin Cost ---


@app.get("/admin/cost")
def admin_get_costs():
    costs = list(cost_col.find({}))
    for c in costs:
        c["_id"] = str(c["_id"])
    return {"items": costs, "total": len(costs)}


@app.get("/admin/cost/{cost_id}")
def get_cost(cost_id: str):
    try:
        oid = ObjectId(cost_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid cost ID")
    cost = cost_col.find_one({"_id": oid})
    if not cost:
        raise HTTPException(status_code=404, detail="Cost not found")
    cost["_id"] = str(cost["_id"])
    return {"ok": True, "item": cost}


@app.post("/admin/cost")
def add_cost(data: dict = Body(...)):
    data.pop("_id", None)
    result = cost_col.insert_one(data)
    new_doc = cost_col.find_one({"_id": result.inserted_id})
    new_doc["_id"] = str(new_doc["_id"])
    return new_doc


@app.put("/admin/cost/{cost_id}")
def update_cost(cost_id: str, data: dict = Body(...)):
    try:
        oid = ObjectId(cost_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid cost ID")
    update_data = {k: v for k, v in data.items() if k != "_id"}
    result = cost_col.update_one({"_id": oid}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cost not found")
    updated = cost_col.find_one({"_id": oid})
    updated["_id"] = str(updated["_id"])
    return {"ok": True, "msg": "Cost updated", "item": updated}


@app.delete("/admin/cost/{cost_id}")
def delete_cost(cost_id: str):
    try:
        oid = ObjectId(cost_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid cost ID: {cost_id}")
    result = cost_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cost not found")
    return {"ok": True, "msg": "Cost deleted"}


