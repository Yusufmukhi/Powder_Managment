from datetime import datetime
from config import supabase


def get_fifo_data(company_id: str, start_dt: datetime, end_dt: datetime):
    """
    Returns FIFO-applied usage rows with:
    qty, cost, supplier, powder, month, date
    """
    # Step 1: Get usage_fifo rows + usage_id (no filter on usage table yet)
    fifo_result = (
        supabase.table("usage_fifo")
        .select("qty_used, rate_per_kg, usage_id")
        .eq("company_id", company_id)
        .execute()
    )

    fifo_rows = fifo_result.data or []

    if not fifo_rows:
        return []

    # Step 2: Get all related usage rows (with date filter here)
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
        .gte("used_at", start_dt.isoformat())
        .lte("used_at", end_dt.isoformat())
        .execute()
    )

    # Build map: usage_id → full usage row with nested powder/supplier
    usage_map = {u["id"]: u for u in usage_result.data or []}

    output = []

    for fifo in fifo_rows:
        usage = usage_map.get(fifo["usage_id"])
        if not usage:
            continue  # skip if usage row was filtered out by date

        qty = float(fifo.get("qty_used", 0))
        rate = float(fifo.get("rate_per_kg", 0))
        cost = qty * rate

        powder = usage.get("powders", {}).get("powder_name", "Unknown")
        supplier = usage.get("suppliers", {}).get("supplier_name", "Unknown")

        used_at_str = usage.get("used_at")
        if not used_at_str:
            continue

        dt = datetime.fromisoformat(used_at_str.replace("Z", "+00:00"))

        output.append({
            "qty": qty,
            "cost": cost,
            "powder": powder,
            "supplier": supplier,
            "month": dt.strftime("%Y-%m"),
            "date": dt
        })

    return output