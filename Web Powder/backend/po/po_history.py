from config import supabase
from datetime import datetime


# -------------------------------------------------
# LOG PO EVENT
# -------------------------------------------------
def log_po_event(
    company_id: str,
    po_id: str,
    action: str,
    meta: dict | None = None
):
    supabase.table("activity_log").insert({
        "company_id": company_id,
        "event_type": action,
        "ref_type": "PURCHASE_ORDER",
        "ref_id": po_id,
        "meta": meta or {},
        "created_at": datetime.utcnow()
    }).execute()


# -------------------------------------------------
# GET PO HISTORY
# -------------------------------------------------
def get_po_history(company_id: str, po_id: str):
    return supabase.table("activity_log") \
        .select("event_type, created_at, meta") \
        .eq("company_id", company_id) \
        .eq("ref_id", po_id) \
        .order("created_at") \
        .execute().data
