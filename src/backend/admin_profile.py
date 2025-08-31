# src/backend/admin_profile.py
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from datetime import datetime
from passlib.hash import bcrypt
import os

router = APIRouter(prefix="/admin", tags=["admin"])

def users_col(req: Request):
    return req.app.state.mongo["scholardatas"]["users"]

def _find_admin(col):
    """
    Resolution order:
      1) role == 'admin'
      2) ADMIN_EMAIL env (exact)
      3) 'admin@gmail.com' (exact)
      4) any email containing 'admin' (case-insensitive)
    On first match, ensure the doc is tagged with role='admin'.
    """
    u = col.find_one({"role": "admin"})
    if u:
        return u

    admin_env = os.getenv("ADMIN_EMAIL")
    if admin_env:
        u = col.find_one({"email": admin_env})
        if u:
            col.update_one({"_id": u["_id"]}, {"$set": {"role": "admin"}})
            return u

    u = col.find_one({"email": "admin@gmail.com"})
    if u:
        col.update_one({"_id": u["_id"]}, {"$set": {"role": "admin"}})
        return u

    u = col.find_one({"email": {"$regex": "admin", "$options": "i"}})
    if u:
        col.update_one({"_id": u["_id"]}, {"$set": {"role": "admin"}})
        return u

    raise HTTPException(status_code=404, detail="Admin user not found")

class ProfileIn(BaseModel):
    email: EmailStr

class PasswordIn(BaseModel):
    old_password: str
    new_password: str

@router.get("/profile")
def get_profile(req: Request, include_password: int = 0):
    col = users_col(req)
    u = _find_admin(col)
    out = {
        "name": "Admin",
        "email": u.get("email", ""),
        "created_at": u.get("created_at").isoformat() if u.get("created_at") else None,
        "updatedAt": u.get("updatedAt").isoformat() if u.get("updatedAt") else None,
    }
    if include_password:
        out["password"] = u.get("password", "")
    return out

@router.put("/profile")
def update_profile(req: Request, payload: ProfileIn):
    col = users_col(req)
    u = _find_admin(col)

    # prevent duplicate email
    if col.find_one({"email": payload.email, "_id": {"$ne": u["_id"]}}):
        raise HTTPException(status_code=409, detail="Email already exists")

    now = datetime.utcnow()
    col.update_one(
        {"_id": u["_id"]},
        {"$set": {"email": payload.email, "updatedAt": now}}
    )
    return {"ok": True, "email": payload.email, "updatedAt": now.isoformat()}

@router.put("/profile/password")
def change_password(req: Request, payload: PasswordIn):
    col = users_col(req)
    u = _find_admin(col)

    stored = u.get("password") or ""
    # accept either plaintext or bcrypt in DB
    if stored.startswith("$2b$"):
        ok = bcrypt.verify(payload.old_password, stored)
        new_value = bcrypt.hash(payload.new_password)
    else:
        ok = (stored == payload.old_password)
        new_value = payload.new_password

    if not ok:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    now = datetime.utcnow()
    col.update_one({"_id": u["_id"]}, {"$set": {"password": new_value, "updatedAt": now}})
    return {"ok": True, "updatedAt": now.isoformat()}
