
from datetime import datetime, timedelta
from collections import defaultdict
import os

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from fastapi.responses import FileResponse
from services.fifo_data import get_fifo_data
from config import supabase


# ---------------------------------------------------------
# Font registration (MONTHLY ONLY)
# backend/assets/fonts
# ---------------------------------------------------------
# At top of file
from utils.fonts import get_font_path   # adjust import path if needed

def register_fonts():
    pdfmetrics.registerFont(
        TTFont("DejaVuSans", get_font_path("DejaVuSans.ttf"))
    )
    pdfmetrics.registerFont(
        TTFont("DejaVuSans-Bold", get_font_path("DejaVuSans-Bold.ttf"))
    )

# ---------------------------------------------------------
# Safe % logic (OPTION 1 – Audit safe)
# ---------------------------------------------------------
def pct(current, previous):
    if previous is None or previous <= 0:
        return None
    return ((current - previous) / previous) * 100


def fmt_pct(val):
    if val is None:
        return "N/A"
    return f"{val:+.1f}%"


def metrics(data):
    qty = sum(d["qty"] for d in data) if data else 0
    cost = sum(d["cost"] for d in data) if data else 0
    cpk = cost / qty if qty else 0
    return qty, cost, cpk


# ---------------------------------------------------------
# MAIN PDF GENERATOR
# ---------------------------------------------------------
def generate_monthly_pdf(company_id: str, year: int, month: int) -> bytes:
    register_fonts()

    import tempfile

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.close()
    pdf_path = tmp.name


    # ---------------- Dates ----------------
    curr_start = datetime(year, month, 1)
    next_month = (curr_start + timedelta(days=32)).replace(day=1)
    curr_end = next_month - timedelta(seconds=1)

    prev_end = curr_start - timedelta(seconds=1)
    prev_start = prev_end.replace(day=1)

    yoy_start = curr_start.replace(year=curr_start.year - 1)
    yoy_end = curr_end.replace(year=curr_end.year - 1)

    # ---------------- FIFO Data ----------------
    curr_data = get_fifo_data(company_id, curr_start, curr_end)
    prev_data = get_fifo_data(company_id, prev_start, prev_end)
    yoy_data  = get_fifo_data(company_id, yoy_start, yoy_end)

    if not curr_data:
        raise ValueError("No FIFO usage data for selected month")

    curr_qty, curr_cost, curr_cpk = metrics(curr_data)
    prev_qty, prev_cost, prev_cpk = metrics(prev_data)
    yoy_qty,  yoy_cost,  yoy_cpk  = metrics(yoy_data)

    # ---------------- Supplier concentration ----------------
    supplier_cost = defaultdict(float)
    for d in curr_data:
        supplier_cost[d["supplier"]] += d["cost"]

    top_supplier = max(supplier_cost, key=supplier_cost.get, default="—")
    top_supplier_pct = (
        supplier_cost[top_supplier] / curr_cost * 100
        if curr_cost > 0 else 0
    )

    # ---------------- Company ----------------
    company = (
        supabase.table("companies")
        .select("company_name, director")
        .eq("id", company_id)
        .single()
        .execute()
    )

    company_name = company.data.get("company_name", "Company")
    director_name = company.data.get("director", "Director")

    backend_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )

    logo_path = os.path.join(backend_root, "assets", "logo.png")
    sig_path  = os.path.join(backend_root, "assets", "signature.png")

    month_str = curr_start.strftime("%B %Y")

    # ---------------- PDF ----------------
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=55,
        rightMargin=55,
        topMargin=90,
        bottomMargin=70
    )

    styles = getSampleStyleSheet()

        # 🔥 Force DejaVuSans everywhere
    for s in styles.byName.values():
            s.fontName = "DejaVuSans"

    styles["BodyText"].fontName = "DejaVuSans"

    styles.add(ParagraphStyle(
            name="CoverTitle",
            fontName="DejaVuSans-Bold",
            fontSize=22,
            alignment=1,
            spaceAfter=12,
            textColor=colors.darkblue
        ))

    styles.add(ParagraphStyle(
            name="CoverSub",
            fontName="DejaVuSans",
            fontSize=13,
            alignment=1,
            spaceAfter=22
        ))

    styles.add(ParagraphStyle(
            name="SectionHeader",
            fontName="DejaVuSans-Bold",
            fontSize=15,
            spaceBefore=18,
            spaceAfter=12,
            textColor=colors.darkblue
        ))

    styles.add(ParagraphStyle(
            name="Insight",
            fontName="DejaVuSans",
            fontSize=11,
            leading=15,
            spaceAfter=8
        ))

    story = []

        # ---------------- Header ----------------
    

    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph(company_name, styles["CoverTitle"]))
    story.append(Paragraph("Monthly Powder Usage & Cost Review", styles["CoverTitle"]))
    story.append(Paragraph(f"{month_str} • Confidential • FIFO Based", styles["CoverSub"]))

        # ---------------- Table ----------------
    table_data = [
    ["Metric", "This Month", "MoM", "YoY"],

    ["Consumption (kg)",
     f"{curr_qty:,.1f}",
     fmt_pct(pct(curr_qty, prev_qty)),
     fmt_pct(pct(curr_qty, yoy_qty))],

    ["Total Cost (₹)",
     f"₹{curr_cost:,.0f}",
     fmt_pct(pct(curr_cost, prev_cost)),
     fmt_pct(pct(curr_cost, yoy_cost))],

    ["Avg Cost / kg (₹)",
     f"₹{curr_cpk:.2f}",
     fmt_pct(pct(curr_cpk, prev_cpk)),
     fmt_pct(pct(curr_cpk, yoy_cpk))],
]


    table = Table(table_data, colWidths=[150, 130, 120, 120])
    table.setStyle(TableStyle([
            ("GRID", (0,0), (-1,-1), 0.8, colors.grey),
            ("BACKGROUND", (0,0), (-1,0), colors.lightblue),
            ("FONTNAME", (0,0), (-1,0), "DejaVuSans-Bold"),
            ("FONTNAME", (0,1), (-1,-1), "DejaVuSans"),
            ("ALIGN", (1,1), (-1,-1), "CENTER"),
            ("TOPPADDING", (0,0), (-1,-1), 9),
            ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ]))

    story.append(table)

        # ---------------- Insights ----------------
    story.append(Spacer(1, 0.35*inch))
    story.append(Paragraph("Key Insights & Actions", styles["SectionHeader"]))
    story.append(Paragraph(
    f"• Average cost per kg is ₹{curr_cpk:.2f} ({fmt_pct(pct(curr_cpk, prev_cpk))} MoM).",
    styles["Insight"]
))


    story.append(Paragraph(
            f"• Supplier concentration: {top_supplier} ({top_supplier_pct:.1f}%). "
            f"{'High risk – diversification advised.' if top_supplier_pct > 60 else 'Within acceptable range.'}",
            styles["Insight"]
        ))

        # ---------------- Signature ----------------
    story.append(Spacer(1, 0.6*inch))
    story.append(Paragraph("Reviewed & Approved by:", styles["BodyText"]))
    story.append(Spacer(1, 0.25*inch))
    story.append(Paragraph("____________________________", styles["BodyText"]))

    

    story.append(Paragraph(director_name, styles["BodyText"]))
    story.append(Paragraph("Founder & Managing Director", styles["BodyText"]))

        # ---------------- Footer ----------------
    def footer(canvas, doc):
            canvas.setFont("DejaVuSans", 9)
            canvas.drawRightString(
                doc.rightMargin + doc.width,
                doc.bottomMargin - 0.45*inch,
                f"Page {canvas.getPageNumber()} • Confidential • {datetime.now().strftime('%d %b %Y')}"
            )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)

    return pdf_path


