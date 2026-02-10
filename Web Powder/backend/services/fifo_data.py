from datetime import datetime
from config import supabase


def get_fifo_data(company_id: str, start_dt: datetime, end_dt: datetime):
    # Step 1: Get usage_fifo + usage_id
    fifo_result = (
        supabase.table("usage_fifo")
        .select("qty_used, rate_per_kg, usage_id")
        .eq("company_id", company_id)
        .gte("usage.used_at", start_dt.isoformat())
        .lte("usage.used_at", end_dt.isoformat())
        .execute()
    )

    fifo_rows = fifo_result.data or []

    if not fifo_rows:
        return []

    # Step 2: Get related usage/powder/supplier data
    usage_ids = [r["usage_id"] for r in fifo_rows]
    usage_result = (
        supabase.table("usage")
        .select("""
            id,
            used_at,
            powder_id,
            supplier_id,
            powders!powder_id (powder_name),
            suppliers!supplier_id (supplier_name)
        """)
        .in_("id", usage_ids)
        .execute()
    )

    usage_map = {u["id"]: u for u in usage_result.data or []}

    output = []
    for r in fifo_rows:
        usage = usage_map.get(r["usage_id"])
        if not usage:
            continue

        qty = float(r["qty_used"] or 0)
        rate = float(r["rate_per_kg"] or 0)
        cost = qty * rate

        powder = usage.get("powders", {}).get("powder_name", "Unknown")
        supplier = usage.get("suppliers", {}).get("supplier_name", "Unknown")

        dt = datetime.fromisoformat(usage["used_at"].replace("Z", "+00:00"))

        output.append({
            "qty": qty,
            "cost": cost,
            "powder": powder,
            "supplier": supplier,
            "month": dt.strftime("%Y-%m"),
            "date": dt
        })

    return output