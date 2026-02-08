from datetime import datetime
from config import supabase


def get_fifo_data(company_id: str, start_dt: datetime, end_dt: datetime):
    """
    Returns FIFO-applied usage rows with:
    qty, cost, supplier, powder, month
    """

    result = (
        supabase
        .table("usage_fifo")
        .select("""
            qty_used,
            rate_per_kg,
            usage:usage_id (
                used_at,
                powders:powder_id ( powder_name ),
                suppliers:supplier_id ( supplier_name )
            )
        """)
        .eq("company_id", company_id)
        .gte("usage.used_at", start_dt.isoformat())
        .lte("usage.used_at", end_dt.isoformat())
        .execute()
    )

    rows = result.data or []
    output = []

    for r in rows:
        usage = r.get("usage")
        if not usage:
            continue

        used_at = usage.get("used_at")
        if not used_at:
            continue

        qty = float(r["qty_used"])
        rate = float(r["rate_per_kg"])
        cost = qty * rate

        powder = (
            usage.get("powders", {}).get("powder_name")
            if usage.get("powders") else "Unknown"
        )

        supplier = (
            usage.get("suppliers", {}).get("supplier_name")
            if usage.get("suppliers") else "Unknown"
        )

        dt = datetime.fromisoformat(used_at.replace("Z", "+00:00"))

        output.append({
            "qty": qty,
            "cost": cost,
            "powder": powder,
            "supplier": supplier,
            "month": dt.strftime("%Y-%m"),
            "date": dt
        })

    return output
