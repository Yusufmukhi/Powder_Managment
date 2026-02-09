
from datetime import datetime, timedelta
from collections import defaultdict
import os
import tempfile

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, Image, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# In reports/annual.py
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from fastapi.responses import FileResponse



from services.fifo_data import get_fifo_data
from config import supabase
from dateutil.relativedelta import relativedelta


# ---------------------------------------------------------
# FONT (Annual ONLY – backend/assets/fonts)
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
# Helpers
# ---------------------------------------------------------
def gap(h=0.25):
    return Spacer(1, h * inch)


def rs(text, style):
    """Safe ₹ rendering for tables"""
    return Paragraph(text.replace("₹", "&#8377;"), style)


def pct(curr, prev):
    if prev is None or prev <= 0:
        return None
    return ((curr - prev) / prev) * 100


def fmt_pct(v):
    return "N/A" if v is None else f"{v:+.1f}%"


def metrics(data):
    qty = sum(d["qty"] for d in data)
    cost = sum(d["cost"] for d in data)
    cpk = cost / qty if qty else 0
    return qty, cost, cpk


# ---------------------------------------------------------
# MAIN – ANNUAL PDF
# ---------------------------------------------------------
def generate_annual_pdf(company_id: str, fy_start_year: int) -> bytes:
    register_fonts()
    import tempfile

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.close()
    pdf_path = tmp.name


    # ---------- FY RANGE ----------
    start = datetime(fy_start_year, 4, 1)
    end   = datetime(fy_start_year + 1, 3, 31, 23, 59, 59)

    prev_start = start.replace(year=start.year - 1)
    prev_end   = end.replace(year=end.year - 1)

    # ---------- FIFO DATA ----------
    curr_data = get_fifo_data(company_id, start, end)
    prev_data = get_fifo_data(company_id, prev_start, prev_end)

    if not curr_data:
        raise ValueError("No FIFO data for selected financial year")

    curr_qty, curr_cost, curr_cpk = metrics(curr_data)
    prev_qty, prev_cost, prev_cpk = metrics(prev_data)

    # ---------- YOY CALCULATIONS ----------
    yoy_qty = pct(curr_qty, prev_qty)
    yoy_cost = pct(curr_cost, prev_cost)
    yoy_cpk = pct(curr_cpk, prev_cpk)

    # ---------- SUPPLIER ----------
    supplier_cost = defaultdict(float)
    for d in curr_data:
        supplier_cost[d["supplier"]] += d["cost"]

    top_supplier = max(supplier_cost, key=supplier_cost.get, default="—")
    top_supplier_pct = (
        supplier_cost[top_supplier] / curr_cost * 100 if curr_cost else 0
    )

    # ---------- COMPANY ----------
    company = (
        supabase.table("companies")
        .select("company_name, director")
        .eq("id", company_id)
        .single()
        .execute()
    )

    company_name  = company.data.get("company_name", "Company")
    director_name = company.data.get("director", "Director")

    backend_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )

    logo_path = os.path.join(backend_root, "assets", "logo.png")
    sig_path  = os.path.join(backend_root, "assets", "signature.png")

    fy_label = f"Financial Year {start.year}-{str(end.year)[-2:]}"

    # ---------- PDF ----------
    doc = SimpleDocTemplate(
    pdf_path,
    pagesize=A4,
    leftMargin=60,
    rightMargin=60,
    topMargin=70,
    bottomMargin=60
)


    styles = getSampleStyleSheet()

        # 🔥 FORCE DejaVu everywhere
    for s in styles.byName.values():
            s.fontName = "DejaVuSans"

    styles["BodyText"].fontName = "DejaVuSans"

    styles.add(ParagraphStyle(
            name="ReportTitle",
            fontName="DejaVuSans-Bold",
            fontSize=18,
            alignment=1,
            spaceAfter=10
        ))

    styles.add(ParagraphStyle(
            name="SectionHeader",
            fontName="DejaVuSans-Bold",
            fontSize=13,
            spaceBefore=14,
            spaceAfter=6
        ))

    styles.add(ParagraphStyle(
            name="ReportBody",
            fontName="DejaVuSans",
            fontSize=10.5,
            leading=14,
            spaceAfter=5
        ))

    story = []

        # ================= COVER =================
    

    story.append(Paragraph(company_name, styles["ReportTitle"]))
    story.append(Paragraph("Annual Powder Consumption & Cost Audit Report", styles["ReportTitle"]))
    story.append(Paragraph(fy_label, styles["ReportBody"]))
    story.append(gap(0.8))
    story.append(Paragraph("CONFIDENTIAL – FOR BANK / AUDITOR REVIEW ONLY", styles["ReportBody"]))

    story.append(PageBreak())

        # ================= SUMMARY =================
    story.append(Paragraph("1. Management Summary", styles["SectionHeader"]))
    story.append(Paragraph(
            "This report reviews powder consumption, cost behaviour, and supplier exposure "
            "based on FIFO inventory records maintained by the company.",
            styles["ReportBody"]
     ))

        # ================= TABLE =================
    story.append(gap(0.3))
    story.append(Paragraph("2. Consumption & Cost Summary", styles["SectionHeader"]))

    summary_table = Table([
            ["Particulars", "Current FY", "Previous FY", "YoY %"],
    ["Total Consumption (kg)",
     f"{curr_qty:,.1f}",
     f"{prev_qty:,.1f}",
     fmt_pct(yoy_qty)],

    ["Total Cost (₹)",
     f"₹{curr_cost:,.0f}",
     f"₹{prev_cost:,.0f}",
     fmt_pct(yoy_cost)],

    ["Average Cost / kg (₹)",
     f"₹{curr_cpk:.2f}",
     f"₹{prev_cpk:.2f}",
     fmt_pct(yoy_cpk)],
        ], colWidths=[190, 110, 110, 80])

    summary_table.setStyle(TableStyle([
            ("GRID", (0,0), (-1,-1), 0.7, colors.black),
            ("FONTNAME", (0,0), (-1,0), "DejaVuSans-Bold"),
            ("FONTNAME", (0,1), (-1,-1), "DejaVuSans"),
            ("ALIGN", (1,1), (-1,-1), "CENTER"),
            ("TOPPADDING", (0,0), (-1,-1), 7),
            ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ]))

    story.append(summary_table)

        # ================= RISK =================
    story.append(gap(0.35))
    story.append(Paragraph("3. Risk & Concentration Analysis", styles["SectionHeader"]))
    story.append(Paragraph(
            f"The highest supplier accounts for {top_supplier_pct:.1f}% of total material spend. "
            f"{'This indicates supplier concentration risk.' if top_supplier_pct > 60 else 'Supplier exposure is within acceptable limits.'}",
            styles["ReportBody"]
        ))

        # ================= CHART =================
    story.append(PageBreak())
    story.append(Paragraph("Appendix A – Average Cost Trend (Last 12 Months)", styles["SectionHeader"]))

    months = []
    trend = []

    # STRICT FY MONTH LOOP (Apr → Mar)
    for i in range(12):
        m_start = datetime(fy_start_year, 4, 1) + relativedelta(months=i)
        m_end = m_start + relativedelta(months=1) - timedelta(seconds=1)

        data = get_fifo_data(company_id, m_start, m_end)
        _, _, cpk = metrics(data)

        months.append(m_start.strftime("%b %y"))
        trend.append(cpk)


    fig, ax = plt.subplots(figsize=(5.2, 3.1))
    ax.plot(months, trend, marker="o")

    ax.set_ylabel("₹ / kg")
    ax.grid(True, alpha=0.3)
    plt.xticks(rotation=45, ha="right", fontsize=9)

    chart_path = tempfile.mktemp(".png")
    fig.savefig(chart_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    story.append(Image(chart_path, width=5*inch, height=3*inch))

        # ================= SIGNATURE =================
    story.append(PageBreak())
    story.append(Paragraph("Approval & Sign-off", styles["SectionHeader"]))
    story.append(gap(0.4))
    story.append(Paragraph("____________________________", styles["ReportBody"]))

    

    story.append(gap(0.15))
    story.append(Paragraph(director_name, styles["ReportBody"]))
    story.append(Paragraph("Authorized Signatory", styles["ReportBody"]))
    story.append(Paragraph(datetime.now().strftime("%d %B %Y"), styles["ReportBody"]))

        # ================= FOOTER =================
    def footer(canvas, doc):
            canvas.setFont("DejaVuSans", 8)
            canvas.drawRightString(
                doc.rightMargin + doc.width,
                doc.bottomMargin - 0.4*inch,
                f"Page {canvas.getPageNumber()}"
            )

    # build PDF
    doc.build(story, onFirstPage=footer, onLaterPages=footer)

    return pdf_path


