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
import os, sys, tempfile, requests
from io import BytesIO


# ---------------- FONT SETUP ----------------
FONT_DIR = os.path.join(os.path.abspath("."), "assets/fonts")

pdfmetrics.registerFont(TTFont("DejaVuSans", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))

registerFontFamily(
    family="DejaVuSans",
    normal="DejaVuSans",
    bold="DejaVuSans-Bold"
)


# ---------------- PDF GENERATOR ----------------
def generate_po_pdf(po_id: str) -> str:

    # ---- PO + COMPANY ----
    po = supabase.table("purchase_orders") \
        .select("""
            id,
            po_number,
            po_date,
            supplier_name,
            supplier_id,
            total_amount,
            companies (
                company_name,
                address,
                city,
                state,
                pincode,
                phone,
                gstin,
                signature_url
            )
        """) \
        .eq("id", po_id) \
        .single() \
        .execute().data

    if not po:
        raise ValueError("PO not found")

    company = po["companies"]

    # ---- SUPPLIER ----
    supplier = None
    if po.get("supplier_id"):
        supplier = supabase.table("suppliers") \
            .select("supplier_name, address, city, state, pincode, gstin") \
            .eq("id", po["supplier_id"]) \
            .single() \
            .execute().data

    # ---- ITEMS ----
    items = supabase.table("purchase_order_items") \
        .select("""
            quantity_kg,
            rate_per_kg,
            amount,
            powders ( powder_name )
        """) \
        .eq("po_id", po_id) \
        .execute().data or []

    # ---- FILE ----
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")

    doc = SimpleDocTemplate(
        tmp.name,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm
    )

    styles = getSampleStyleSheet()
    styles["Normal"].fontName = "DejaVuSans"

    styles.add(ParagraphStyle(
        name="ReportTitle",
        fontName="DejaVuSans-Bold",
        fontSize=14,
        alignment=TA_CENTER,
        spaceAfter=12
    ))

    story = []

    # ---- HEADER ----
    story.append(Paragraph(company["company_name"], styles["ReportTitle"]))
    story.append(Paragraph("PURCHASE ORDER", styles["ReportTitle"]))
    story.append(Spacer(1, 10))

    # ---- FROM / TO ----
    from_block = f"""
    <b>From:</b><br/>
    {company['company_name']}<br/>
    {company.get('address','')}<br/>
    {company.get('city','')}, {company.get('state','')} - {company.get('pincode','')}<br/>
    GSTIN: {company.get('gstin','')}
    """

    to_block = f"<b>To:</b><br/>{po['supplier_name']}"
    if supplier:
        to_block = f"""
        <b>To:</b><br/>
        {supplier['supplier_name']}<br/>
        {supplier.get('address','')}<br/>
        {supplier.get('city','')}, {supplier.get('state','')} - {supplier.get('pincode','')}<br/>
        GSTIN: {supplier.get('gstin','')}
        """

    story.append(Table(
        [[Paragraph(from_block, styles["Normal"]),
          Paragraph(to_block, styles["Normal"])]],
        style=[("VALIGN", (0, 0), (-1, -1), "TOP")]
    ))

    story.append(Spacer(1, 12))

    # ---- META ----
    story.append(Paragraph(
        f"<b>PO Number:</b> {po['po_number']}<br/>"
        f"<b>Date:</b> {po['po_date']}",
        styles["Normal"]
    ))

    story.append(Spacer(1, 12))

    # ---- ITEMS TABLE ----
    data = [["#", "Powder", "Qty (kg)", "Rate (₹)", "Amount (₹)"]]
    total = 0

    for i, it in enumerate(items, 1):
        total += float(it["amount"])
        data.append([
            i,
            it["powders"]["powder_name"],
            f"{it['quantity_kg']:.2f}",
            f"{it['rate_per_kg']:.2f}",
            f"{it['amount']:.2f}"
        ])

    data.append(["", "", "", "TOTAL", f"{total:.2f}"])

    story.append(Table(
        data,
        colWidths=[10*mm, None, 25*mm, 30*mm, 35*mm],
        style=[
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("FONT", (0, 0), (-1, 0), "DejaVuSans-Bold"),
            ("FONT", (0, -1), (-1, -1), "DejaVuSans-Bold"),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT")
        ]
    ))

    story.append(Spacer(1, 20))

    # ---- SIGNATURE ----
    if company.get("signature_url"):
        try:
            r = requests.get(company["signature_url"], timeout=5)
            story.append(Image(BytesIO(r.content), 40*mm, 15*mm))
        except:
            pass

    doc.build(story)
    return tmp.name
