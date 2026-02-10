from datetime import datetime
from config import supabase


def get_fifo_data(company_id: str, start_dt: datetime, end_dt: datetime):
    """
    Returns FIFO-applied usage rows with:
    qty, cost, supplier, powder, month, date
    """
    # Step 1: Get all usage_fifo rows for the company (no date filter here)
    fifo_result = (
        supabase.table("usage_fifo")
        .select("qty_used, rate_per_kg, usage_id")
        .eq("company_id", company_id)
        .execute()
    )

    fifo_rows = fifo_result.data or []

    print(f"[DEBUG] Fetched {len(fifo_rows)} usage_fifo rows for company {company_id}")

    if not fifo_rows:
        return []

    # Step 2: Get matching usage rows with date filter + joins
    usage_ids = [row["usage_id"] for row in fifo_rows]

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

    print(f"[DEBUG] Fetched {len(usage_result.data or [])} usage rows in date range")

    # Create lookup: usage_id → full usage data
    usage_map = {u["id"]: u for u in usage_result.data or []}

    output = []

    for fifo in fifo_rows:
        usage = usage_map.get(fifo["usage_id"])
        if not usage:
            continue  # this usage was filtered out by date

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
        except ValueError:
            print(f"[WARN] Invalid used_at format: {used_at_str}")
            continue

        output.append({
            "qty": qty,
            "cost": cost,
            "powder": powder,
            "supplier": supplier,
            "month": dt.strftime("%Y-%m"),
            "date": dt
        })

    print(f"[DEBUG] Returning {len(output)} valid FIFO rows")
    return output