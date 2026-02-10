from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict
from config import supabase
from session import get_company_id

router = APIRouter(prefix="/settings", tags=["Settings"])


# -------------------------------------------------
# HELPER: get logged-in user
# -------------------------------------------------
def get_user(user_id: str):
    user = (
        supabase
        .table("users")
        .select("id, role, company_id, full_name, username")
        .eq("id", user_id)
        .single()
        .execute()
        .data
    )

    if not user:
        raise HTTPException(404, "User not found")

    return user


# =================================================
# 👤 UPDATE OWN PROFILE (OWNER + STAFF)
# =================================================
@router.put("/profile")
def update_my_profile(
    payload: Dict,
    request: Request,
    company_id: str = Depends(get_company_id)
):
    user_id = payload.get("user_id")

    if not user_id:
        raise HTTPException(400, "user_id missing")

    user = get_user(user_id)

    # Security: user must belong to same company
    if user["company_id"] != company_id:
        raise HTTPException(403, "Unauthorized")

    update_data = {}

    if "full_name" in payload:
        update_data["full_name"] = payload["full_name"]

    if "password" in payload:
        update_data["password"] = payload["password"]  # hash if needed

    if not update_data:
        raise HTTPException(400, "Nothing to update")

    supabase.table("users").update(update_data).eq("id", user_id).execute()

    return {"status": "ok", "message": "Profile updated"}


# =================================================
# 🏢 UPDATE COMPANY SETTINGS (OWNER ONLY)
# =================================================
@router.put("/company")
def update_company_settings(
    payload: Dict,
    request: Request,
    company_id: str = Depends(get_company_id)
):
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(400, "user_id missing")

    user = get_user(user_id)

    if user["role"] != "owner":
        raise HTTPException(403, "Only owner can update company")

    allowed_fields = [
        "company_name",
        "address",
        "city",
        "state",
        "pincode",
        "phone",
        "email",
        "gstin",
        "signature_url"
    ]

    update_data = {
        k: v for k, v in payload.items() if k in allowed_fields
    }

    if not update_data:
        raise HTTPException(400, "No valid fields")

    supabase.table("companies").update(update_data).eq("id", company_id).execute()

    return {"status": "ok", "message": "Company updated"}


# =================================================
# 👥 LIST STAFF (OWNER ONLY)
# =================================================
@router.get("/users")
def list_users(
    user_id: str,
    company_id: str = Depends(get_company_id)
):
    user = get_user(user_id)

    if user["role"] != "owner":
        raise HTTPException(403, "Only owner allowed")

    data = (
        supabase
        .table("users")
        .select("id, username, full_name, role, created_at")
        .eq("company_id", company_id)
        .order("created_at")
        .execute()
        .data
    )

    return data


# =================================================
# ✏️ UPDATE STAFF ROLE / NAME (OWNER ONLY)
# =================================================
@router.put("/users/{target_user_id}")
def update_user(
    target_user_id: str,
    payload: Dict,
    user_id: str,
    company_id: str = Depends(get_company_id)
):
    owner = get_user(user_id)

    if owner["role"] != "owner":
        raise HTTPException(403, "Only owner allowed")

    target = get_user(target_user_id)

    if target["company_id"] != company_id:
        raise HTTPException(403, "Unauthorized")

    update_data = {}

    if "full_name" in payload:
        update_data["full_name"] = payload["full_name"]

    if "role" in payload:
        update_data["role"] = payload["role"]

    if not update_data:
        raise HTTPException(400, "Nothing to update")

    supabase.table("users").update(update_data).eq("id", target_user_id).execute()

    return {"status": "ok", "message": "User updated"}
