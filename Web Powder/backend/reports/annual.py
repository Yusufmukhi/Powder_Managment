
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
def generate_annual_pdf(company_id: str, fy_start_year: int) -> str:
    register_fonts()

    # Create temp file early (for both cases)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    pdf_path = tmp.name
    tmp.close()  # close immediately — we don't need the handle

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=60,
        rightMargin=60,
        topMargin=70,
        bottomMargin=60
    )

    styles = getSampleStyleSheet()

    # Force DejaVu everywhere (good practice)
    for s in styles.byName.values():
        s.fontName = "DejaVuSans"

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

    styles.add(ParagraphStyle(
        name="NoDataMessage",
        fontName="DejaVuSans",
        fontSize=12,
        leading=16,
        alignment=1,
        spaceAfter=12
    ))

    story = []

    # ────────────────────────────────────────────────
    # Early check: is there any data for this FY?
    # ────────────────────────────────────────────────
    start = datetime(fy_start_year, 4, 1)
    end   = datetime(fy_start_year + 1, 3, 31, 23, 59, 59)

    # Fast count query — no need to fetch full rows
    count_result = supabase.table("usage_fifo") \
        .select("id", count="exact") \
        .eq("company_id", company_id) \
        .gte("usage.used_at", start.isoformat()) \
        .lt("usage.used_at", end.isoformat()) \
        .execute()

    has_data = count_result.count > 0 if hasattr(count_result, 'count') else False

    if not has_data:
        # ──── Build simple "No Data" PDF ────
        story.append(Paragraph("Annual Powder Consumption & Cost Audit Report", styles["ReportTitle"]))
        story.append(Spacer(1, 0.6*inch))
        story.append(Paragraph(
            f"Financial Year {fy_start_year}–{fy_start_year+1}",
            styles["SectionHeader"]
        ))
        story.append(Spacer(1, 1.2*inch))
        story.append(Paragraph(
            "No transactions or powder usage data found for this financial year.",
            styles["NoDataMessage"]
        ))
        story.append(Spacer(1, 0.4*inch))
        story.append(Paragraph(
            "The report cannot be generated until at least one usage record is recorded.",
            styles["NoDataMessage"]
        ))
        story.append(Spacer(1, 0.8*inch))
        story.append(Paragraph(
            "Please check back later or contact support if you believe this is an error.",
            styles["ReportBody"]
        ))
        story.append(Spacer(1, 1.5*inch))
        story.append(Paragraph(
            f"Generated on {datetime.now().strftime('%d %B %Y')} • Confidential",
            styles["ReportBody"]
        ))

        # Build and return the minimal PDF
        def empty_footer(canvas, doc):
            canvas.setFont("DejaVuSans", 8)
            canvas.drawRightString(
                doc.rightMargin + doc.width,
                doc.bottomMargin - 0.4*inch,
                f"Page {canvas.getPageNumber()}"
            )

        doc.build(story, onFirstPage=empty_footer, onLaterPages=empty_footer)
        return pdf_path

    # ────────────────────────────────────────────────
    # There IS data → proceed with full report
    # ────────────────────────────────────────────────

    prev_start = start.replace(year=start.year - 1)
    prev_end   = end.replace(year=end.year - 1)

    curr_data = get_fifo_data(company_id, start, end)
    prev_data = get_fifo_data(company_id, prev_start, prev_end)

    curr_qty, curr_cost, curr_cpk = metrics(curr_data)
    prev_qty, prev_cost, prev_cpk = metrics(prev_data)

    yoy_qty  = pct(curr_qty, prev_qty)
    yoy_cost = pct(curr_cost, prev_cost)
    yoy_cpk  = pct(curr_cpk, prev_cpk)

    # Supplier concentration
    supplier_cost = defaultdict(float)
    for d in curr_data:
        supplier_cost[d["supplier"]] += d["cost"]

    top_supplier = max(supplier_cost, key=supplier_cost.get, default="—")
    top_supplier_pct = (
        supplier_cost[top_supplier] / curr_cost * 100 if curr_cost else 0
    )

    # Company info
    company = supabase.table("companies") \
        .select("company_name, director") \
        .eq("id", company_id) \
        .single() \
        .execute()

    company_name  = company.data.get("company_name", "Company")
    director_name = company.data.get("director", "Director")

    fy_label = f"Financial Year {start.year}-{str(end.year)[-2:]}"

    # ──── Cover Page ────
    story.append(Paragraph(company_name, styles["ReportTitle"]))
    story.append(Paragraph("Annual Powder Consumption & Cost Audit Report", styles["ReportTitle"]))
    story.append(Paragraph(fy_label, styles["ReportBody"]))
    story.append(gap(0.8))
    story.append(Paragraph("CONFIDENTIAL – FOR BANK / AUDITOR REVIEW ONLY", styles["ReportBody"]))
    story.append(PageBreak())

    # ──── Management Summary ────
    story.append(Paragraph("1. Management Summary", styles["SectionHeader"]))
    story.append(Paragraph(
        "This report reviews powder consumption, cost behaviour, and supplier exposure "
        "based on FIFO inventory records maintained by the company.",
        styles["ReportBody"]
    ))

    # ──── Summary Table ────
    story.append(gap(0.3))
    story.append(Paragraph("2. Consumption & Cost Summary", styles["SectionHeader"]))

    summary_table = Table([
        ["Particulars", "Current FY", "Previous FY", "YoY %"],
        ["Total Consumption (kg)", f"{curr_qty:,.1f}", f"{prev_qty:,.1f}", fmt_pct(yoy_qty)],
        ["Total Cost (₹)", f"₹{curr_cost:,.0f}", f"₹{prev_cost:,.0f}", fmt_pct(yoy_cost)],
        ["Average Cost / kg (₹)", f"₹{curr_cpk:.2f}", f"₹{prev_cpk:.2f}", fmt_pct(yoy_cpk)],
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

    # ──── Risk & Concentration ────
    story.append(gap(0.35))
    story.append(Paragraph("3. Risk & Concentration Analysis", styles["SectionHeader"]))
    story.append(Paragraph(
        f"The highest supplier accounts for {top_supplier_pct:.1f}% of total material spend. "
        f"{'This indicates supplier concentration risk.' if top_supplier_pct > 60 else 'Supplier exposure is within acceptable limits.'}",
        styles["ReportBody"]
    ))

    # ──── Chart ────
    story.append(PageBreak())
    story.append(Paragraph("Appendix A – Average Cost Trend (Last 12 Months)", styles["SectionHeader"]))

    months = []
    trend = []

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

    # ──── Signature ────
    story.append(PageBreak())
    story.append(Paragraph("Approval & Sign-off", styles["SectionHeader"]))
    story.append(gap(0.4))
    story.append(Paragraph("____________________________", styles["ReportBody"]))
    story.append(gap(0.15))
    story.append(Paragraph(director_name, styles["ReportBody"]))
    story.append(Paragraph("Authorized Signatory", styles["ReportBody"]))
    story.append(Paragraph(datetime.now().strftime("%d %B %Y"), styles["ReportBody"]))

    # ──── Footer ────
    def footer(canvas, doc):
        canvas.setFont("DejaVuSans", 8)
        canvas.drawRightString(
            doc.rightMargin + doc.width,
            doc.bottomMargin - 0.4*inch,
            f"Page {canvas.getPageNumber()}"
        )

    # Build full PDF
    doc.build(story, onFirstPage=footer, onLaterPages=footer)

    return pdf_path

