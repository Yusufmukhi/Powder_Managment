from config import supabase
from datetime import datetime
from fastapi import HTTPException


# -------------------------------
# CREATE PO
# -------------------------------
def create_po(company_id: str, user_id: str, payload: dict):

    po = supabase.table("purchase_orders").insert({
        "company_id": company_id,
        "supplier_id": payload["supplier_id"],
        "supplier_name": payload["supplier_name"],
        "po_number": payload["po_number"],
        "po_date": payload["po_date"],
        "total_amount": payload["total_amount"],
        "status": "OPEN",
        "created_by": user_id
    }).execute().data[0]

    for item in payload["items"]:
        supabase.table("purchase_order_items").insert({
            "po_id": po["id"],
            "powder_id": item["powder_id"],
            "quantity_kg": item["quantity_kg"],
            "rate_per_kg": item["rate_per_kg"],
            "amount": item["quantity_kg"] * item["rate_per_kg"]
        }).execute()

    return po


# -------------------------------
# CANCEL PO
# -------------------------------
def cancel_po(company_id: str, po_id: str, user_id: str):
    po = supabase.table("purchase_orders") \
        .select("status") \
        .eq("id", po_id) \
        .single() \
        .execute().data

    if po["status"] != "OPEN":
        raise HTTPException(400, "Only OPEN POs can be cancelled")

    supabase.table("purchase_orders").update({
        "status": "CANCELLED",
        "updated_by": user_id
    }).eq("id", po_id).execute()

    return {"status": "cancelled"}


# -------------------------------
# DELIVER PO → ADD TO STOCK
# -------------------------------
from datetime import datetime
from config import supabase

def deliver_po(company_id: str, po_id: str, user_id: str):

    if not company_id or not user_id:
        raise ValueError("company_id and user_id required")

    po = supabase.table("purchase_orders") \
        .select("supplier_id, status") \
        .eq("id", po_id) \
        .single() \
        .execute().data

    if po["status"] != "OPEN":
        raise ValueError("Only OPEN POs can be delivered")

    items = supabase.table("purchase_order_items") \
        .select("powder_id, quantity_kg, rate_per_kg") \
        .eq("po_id", po_id) \
        .execute().data

    for item in items:
        supabase.table("stock_batches").insert({
            "company_id": company_id,
            "powder_id": item["powder_id"],
            "supplier_id": po["supplier_id"],
            "qty_received": item["quantity_kg"],
            "qty_remaining": item["quantity_kg"],
            "rate_per_kg": item["rate_per_kg"],
            "created_by": user_id
        }).execute()

    supabase.table("purchase_orders").update({
        "status": "COMPLETED",
        "delivered_at": datetime.utcnow().isoformat(),
        "updated_by": user_id
    }).eq("id", po_id).execute()

    return {"status": "delivered"}


# -------------------------------
# LIST POs
# -------------------------------
def list_pos(company_id: str):
    return supabase.table("purchase_orders") \
        .select("*") \
        .eq("company_id", company_id) \
        .order("created_at", desc=True) \
        .execute().data
