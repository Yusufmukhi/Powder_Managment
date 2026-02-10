from datetime import datetime
from config import supabase


def get_fifo_data(company_id: str, start_dt: datetime, end_dt: datetime):
    """
    Safe two-step fetch – avoids all join errors (PGRST108).
    Returns list of dicts: qty, cost, powder, supplier, month, date
    """
    # Step 1: Get raw FIFO rows (NO joins, NO usage filter here)
    fifo_result = supabase.table("usage_fifo") \
        .select("qty_used, rate_per_kg, usage_id") \
        .eq("company_id", company_id) \
        .execute()

    fifo_rows = fifo_result.data or []

    if not fifo_rows:
        print(f"[FIFO DEBUG] No usage_fifo rows for company {company_id}")
        return []

    print(f"[FIFO DEBUG] Fetched {len(fifo_rows)} usage_fifo rows")

    # Step 2: Get matching usage rows + joins + date filter
    usage_ids = [r["usage_id"] for r in fifo_rows if r.get("usage_id")]

    if not usage_ids:
        print("[FIFO DEBUG] No valid usage_ids")
        return []

    usage_result = supabase.table("usage") \
        .select("""
            id,
            used_at,
            powder_id,
            supplier_id,
            powders!powder_id (powder_name),
            suppliers!supplier_id (supplier_name)
        """) \
        .in_("id", usage_ids) \
        .gte("used_at", start_dt.isoformat()) \
        .lte("used_at", end_dt.isoformat()) \
        .execute()

    usage_rows = usage_result.data or []
    print(f"[FIFO DEBUG] Fetched {len(usage_rows)} usage rows in date range")

    # Map usage_id → full row
    usage_map = {u["id"]: u for u in usage_rows}

    output = []

    for fifo in fifo_rows:
        usage = usage_map.get(fifo["usage_id"])
        if not usage:
            continue

        qty = float(fifo.get("qty_used", 0))
        rate = float(fifo.get("rate_per_kg", 0))
        cost = qty * rate

        powder = usage.get("powders", {}).get("powder_name", "Unknown Powder")
        supplier = usage.get("suppliers", {}).get("supplier_name", "Unknown Supplier")

        used_at_str = usage.get("used_at")
        if not used_at_str:
            continue

        try:
            dt = datetime.fromisoformat(used_at_str.replace("Z", "+00:00"))
        except Exception as e:
            print(f"[FIFO WARN] Invalid used_at: {used_at_str} - {e}")
            continue

        output.append({
            "qty": qty,
            "cost": cost,
            "powder": powder,
            "supplier": supplier,
            "month": dt.strftime("%Y-%m"),
            "date": dt
        })

    print(f"[FIFO DEBUG] Returning {len(output)} valid FIFO rows")
    return output