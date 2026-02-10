from datetime import datetime
from config import supabase


def get_fifo_data(company_id: str, start_dt: datetime, end_dt: datetime):
    """
    Safe two-step fetch to avoid Supabase join errors (PGRST108).
    Returns FIFO usage rows with qty, cost, powder, supplier, month, date.
    """
    # Step 1: Get FIFO rows (only basic columns – no joins)
    fifo_result = (
        supabase.table("usage_fifo")
        .select("qty_used, rate_per_kg, usage_id")
        .eq("company_id", company_id)
        .execute()
    )

    fifo_rows = fifo_result.data or []

    if not fifo_rows:
        print(f"[FIFO] No rows for company {company_id}")
        return []

    print(f"[FIFO] Fetched {len(fifo_rows)} usage_fifo rows")

    # Step 2: Get matching usage rows with date filter + joins
    usage_ids = [row["usage_id"] for row in fifo_rows if row.get("usage_id")]

    if not usage_ids:
        print("[FIFO] No valid usage_ids found")
        return []

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

    usage_rows = usage_result.data or []
    print(f"[FIFO] Fetched {len(usage_rows)} usage rows in date range")

    # Map usage_id → usage row
    usage_map = {u["id"]: u for u in usage_rows}

    output = []

    for fifo in fifo_rows:
        usage = usage_map.get(fifo["usage_id"])
        if not usage:
            continue  # filtered by date or missing

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
        except ValueError as e:
            print(f"[WARN] Invalid used_at: {used_at_str} - {e}")
            continue

        output.append({
            "qty": qty,
            "cost": cost,
            "powder": powder,
            "supplier": supplier,
            "month": dt.strftime("%Y-%m"),
            "date": dt
        })

    print(f"[FIFO] Returning {len(output)} valid rows after filtering")
    return output