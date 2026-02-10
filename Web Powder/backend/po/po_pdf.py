from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

from config import supabase
from datetime import datetime
import os
import tempfile
import requests
from io import BytesIO


# ---------------- FONT SETUP ----------------
FONT_DIR = os.path.join(os.path.abspath(os.path.dirname(__file__)), "..", "..", "assets", "fonts")

pdfmetrics.registerFont(TTFont("DejaVuSans", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))

registerFontFamily(
    family="DejaVuSans",
    normal="DejaVuSans",
    bold="DejaVuSans-Bold"
)


# ---------------- PDF GENERATOR ----------------
def generate_po_pdf(po_id: str) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_path = tmp.name
    tmp.close()

    doc = SimpleDocTemplate(tmp_path, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # ---- PO + COMPANY ----
    po = supabase.table("purchase_orders") \
        .select("""
            id, po_number, po_date, supplier_name, supplier_id, total_amount,
            companies (company_name, director, signature_url)
        """) \
        .eq("id", po_id) \
        .single() \
        .execute().data

    if not po:
        raise ValueError(f"PO with id {po_id} not found")

    company = po.get("companies", {}) or {}

    # ---- ITEMS ----
    items = supabase.table("purchase_order_items") \
        .select("""
            id,
            quantity_kg,
            rate_per_kg,
            amount,
            powder_id,
            powders!powder_id (powder_name)
        """) \
        .eq("po_id", po_id) \
        .execute().data

    # Debug print – very important to see what Supabase returns
    print(f"[DEBUG] PO {po_id} - raw items from Supabase: {items}")

    story.append(Paragraph(f"<b>PO Number:</b> {po['po_number']}", styles["Normal"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>Date:</b> {po['po_date']}", styles["Normal"]))
    story.append(Spacer(1, 12))

    # ---- ITEMS TABLE ----
    data = [["#", "Powder", "Qty (kg)", "Rate (₹)", "Amount (₹)"]]
    total = 0

    for i, item in enumerate(items or [], 1):
        # Safe powder name extraction
        powder_name = "Unknown Powder"
        if "powders" in item and isinstance(item["powders"], dict):
            powder_name = item["powders"].get("powder_name", "Missing name")
        elif "powder_name" in item:
            powder_name = item["powder_name"]

        qty = float(item.get("quantity_kg", 0))
        rate = float(item.get("rate_per_kg", 0))
        amount = float(item.get("amount", 0)) or (qty * rate)

        total += amount

        data.append([
            str(i),
            powder_name,
            f"{qty:.2f}",
            f"{rate:.2f}",
            f"{amount:.2f}"
        ])

    data.append(["", "", "", "TOTAL", f"{total:.2f}"])

    table = Table(data, colWidths=[10*mm, None, 25*mm, 30*mm, 35*mm])
    table.setStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("FONT", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("FONT", (0, -1), (-1, -1), "DejaVuSans-Bold"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
    ])
    story.append(table)
    story.append(Spacer(1, 20))

    # ---- SIGNATURE ----
    if company.get("signature_url"):
        try:
            r = requests.get(company["signature_url"], timeout=5)
            if r.status_code == 200:
                story.append(Image(BytesIO(r.content), width=40*mm, height=15*mm))
        except Exception as e:
            print(f"Signature load failed: {e}")

    doc.build(story)
    return tmp_path