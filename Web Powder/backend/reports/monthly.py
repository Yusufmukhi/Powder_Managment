from datetime import datetime, timedelta
from collections import defaultdict
import tempfile

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from dateutil.relativedelta import relativedelta

from fastapi.responses import FileResponse
from services.fifo_data import get_fifo_data
from config import supabase

from utils.fonts import get_font_path

# ---------------------------------------------------------
# Brand palette — kept consistent with annual.py
# ---------------------------------------------------------
NAVY = colors.HexColor("#0B1F3A")
STEEL = colors.HexColor("#3E5C86")
LIGHT_BAND = colors.HexColor("#F4F6FA")
BORDER = colors.HexColor("#D8DEE9")
GOOD = colors.HexColor("#1E824C")
BAD = colors.HexColor("#C0392B")
MUTED = colors.HexColor("#6B7280")
INK = colors.HexColor("#1F2937")

SECTION_GAP = 16   # consistent vertical rhythm between major sections
BLOCK_GAP = 8


def register_fonts():
    pdfmetrics.registerFont(TTFont("DejaVuSans", get_font_path("DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", get_font_path("DejaVuSans-Bold.ttf")))


def gap(pts=SECTION_GAP):
    return Spacer(1, pts)


def pct(current, previous):
    if previous is None or previous <= 0:
        return None
    return ((current - previous) / previous) * 100


def fmt_pct(val):
    if val is None:
        return "N/A"
    return f"{val:+.1f}%"


def pct_color(val):
    if val is None:
        return MUTED
    return GOOD if val >= 0 else BAD


def metrics(data):
    qty = sum(d["qty"] for d in data) if data else 0
    cost = sum(d["cost"] for d in data) if data else 0
    cpk = cost / qty if qty else 0
    return qty, cost, cpk


def _styles():
    styles = getSampleStyleSheet()
    for s in styles.byName.values():
        s.fontName = "DejaVuSans"
    styles["BodyText"].fontName = "DejaVuSans"

    styles.add(ParagraphStyle(
        name="SectionHeader", fontName="DejaVuSans-Bold", fontSize=12.5,
        textColor=NAVY, spaceBefore=0, spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        name="Insight", fontName="DejaVuSans", fontSize=10, leading=14.5,
        spaceAfter=6, textColor=INK
    ))
    styles.add(ParagraphStyle(
        name="KpiValue", fontName="DejaVuSans-Bold", fontSize=17, textColor=NAVY, leading=20
    ))
    styles.add(ParagraphStyle(
        name="KpiLabel", fontName="DejaVuSans", fontSize=8.3, textColor=MUTED, leading=11
    ))
    styles.add(ParagraphStyle(
        name="KpiDelta", fontName="DejaVuSans", fontSize=8.3, leading=11
    ))
    styles.add(ParagraphStyle(
        name="NoDataMessage", fontName="DejaVuSans", fontSize=11.5, leading=16,
        alignment=1, spaceAfter=12, textColor=colors.HexColor("#374151")
    ))
    styles.add(ParagraphStyle(
        name="FinePrint", fontName="DejaVuSans", fontSize=7.6, textColor=MUTED, leading=10.8
    ))
    styles.add(ParagraphStyle(
        name="DocMetaLabel", fontName="DejaVuSans", fontSize=7.6, textColor=MUTED, leading=10
    ))
    styles.add(ParagraphStyle(
        name="DocMetaValue", fontName="DejaVuSans-Bold", fontSize=9.3, textColor=INK, leading=12
    ))
    styles.add(ParagraphStyle(
        name="SigLabel", fontName="DejaVuSans", fontSize=8.5, textColor=MUTED, spaceAfter=16
    ))
    styles.add(ParagraphStyle(
        name="SigName", fontName="DejaVuSans-Bold", fontSize=10.5, textColor=NAVY
    ))
    styles.add(ParagraphStyle(
        name="SigRole", fontName="DejaVuSans", fontSize=8.7, textColor=MUTED
    ))
    return styles


def _letterhead(canvas, doc, company_name, report_title, period_label, ref_no):
    canvas.saveState()
    w, h = A4

    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 70, w, 70, stroke=0, fill=1)
    canvas.setFillColor(STEEL)
    canvas.rect(0, h - 73, w, 3, stroke=0, fill=1)

    canvas.setFillColor(colors.white)
    canvas.setFont("DejaVuSans-Bold", 14)
    canvas.drawString(doc.leftMargin, h - 32, company_name)
    canvas.setFont("DejaVuSans", 8.5)
    canvas.drawString(doc.leftMargin, h - 46, report_title)

    canvas.setFont("DejaVuSans", 8.5)
    canvas.drawRightString(w - doc.rightMargin, h - 32, period_label)
    canvas.setFont("DejaVuSans", 7.5)
    canvas.setFillColor(colors.HexColor("#C7D2E3"))
    canvas.drawRightString(w - doc.rightMargin, h - 46, f"Ref: {ref_no}")

    canvas.saveState()
    canvas.setFont("DejaVuSans-Bold", 60)
    canvas.setFillColor(colors.Color(0.85, 0.87, 0.92, alpha=0.35))
    canvas.translate(w / 2, h / 2)
    canvas.rotate(38)
    canvas.drawCentredString(0, 0, "CONFIDENTIAL")
    canvas.restoreState()

    canvas.setFillColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, 44, w - doc.rightMargin, 44)
    canvas.setFont("DejaVuSans", 7.6)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 32, company_name)
    canvas.drawCentredString(w / 2, 32, "Confidential — Internal & Auditor Use Only")
    canvas.drawRightString(w - doc.rightMargin, 32,
                            f"Page {canvas.getPageNumber()} · Generated {datetime.now().strftime('%d %b %Y')}")
    canvas.restoreState()


def _kpi_card(styles, label, value, delta_text, delta_color, width):
    inner = Table(
        [[Paragraph(label.upper(), styles["KpiLabel"])],
         [Paragraph(value, styles["KpiValue"])],
         [Paragraph(delta_text, ParagraphStyle(
             "d", parent=styles["KpiDelta"], textColor=delta_color))]],
        colWidths=[width - 16]
    )
    inner.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    wrapper = Table([[inner]], colWidths=[width])
    wrapper.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return wrapper


def _doc_control_strip(styles, rows, width):
    """A tidy metadata strip: Company / Report Type / Ref / Classification."""
    cells = []
    for label, value in rows:
        cells.append(Table(
            [[Paragraph(label.upper(), styles["DocMetaLabel"])],
             [Paragraph(value, styles["DocMetaValue"])]],
            colWidths=[width / len(rows) - 8]
        ))
    t = Table([cells], colWidths=[width / len(rows)] * len(rows))
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    box = Table([[t]], colWidths=[width])
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BAND),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    return box


def _breakdown_table(header, rows, col_widths):
    t = Table([header] + rows, colWidths=col_widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), STEEL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "DejaVuSans"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 1), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BAND]),
    ]))
    return t


def generate_monthly_pdf(company_id: str, year: int, month: int) -> str:
    register_fonts()
    styles = _styles()

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    pdf_path = tmp.name
    tmp.close()

    doc = SimpleDocTemplate(
        pdf_path, pagesize=A4,
        leftMargin=48, rightMargin=48, topMargin=95, bottomMargin=58
    )
    content_width = A4[0] - doc.leftMargin - doc.rightMargin

    story = []

    company = supabase.table("companies") \
        .select("company_name, director") \
        .eq("id", company_id).single().execute()

    company_name = company.data.get("company_name", "Company")
    director_name = company.data.get("director", "Director")

    curr_start = datetime(year, month, 1)
    next_month = (curr_start + timedelta(days=32)).replace(day=1)
    curr_end = next_month - timedelta(seconds=1)
    month_str = curr_start.strftime("%B %Y")
    ref_no = f"MR-{year}{month:02d}-{company_id[:8].upper()}"

    def footer(canvas, doc_):
        _letterhead(canvas, doc_, company_name, "Monthly Powder Usage & Cost Review", month_str, ref_no)

    curr_data = get_fifo_data(company_id, curr_start, curr_end)
    has_data = len(curr_data) > 0

    if not has_data:
        story.append(Spacer(1, 1.6 * inch))
        story.append(Paragraph(f"No usage data recorded for {month_str}.", styles["NoDataMessage"]))
        story.append(gap(0.3 * 72))
        story.append(Paragraph(
            "This report is generated automatically once at least one powder usage entry "
            "is logged for the selected period.", styles["NoDataMessage"]))
        doc.build(story, onFirstPage=footer, onLaterPages=footer)
        return pdf_path

    prev_end = curr_start - timedelta(seconds=1)
    prev_start = prev_end.replace(day=1)
    yoy_start = curr_start.replace(year=curr_start.year - 1)
    yoy_end = curr_end.replace(year=curr_end.year - 1)

    prev_data = get_fifo_data(company_id, prev_start, prev_end)
    yoy_data = get_fifo_data(company_id, yoy_start, yoy_end)

    curr_qty, curr_cost, curr_cpk = metrics(curr_data)
    prev_qty, prev_cost, prev_cpk = metrics(prev_data)
    yoy_qty, yoy_cost, yoy_cpk = metrics(yoy_data)

    mom_qty, mom_cost, mom_cpk = pct(curr_qty, prev_qty), pct(curr_cost, prev_cost), pct(curr_cpk, prev_cpk)

    supplier_cost = defaultdict(float)
    powder_qty = defaultdict(float)
    powder_cost = defaultdict(float)
    for d in curr_data:
        supplier_cost[d["supplier"]] += d["cost"]
        powder_qty[d["powder"]] += d["qty"]
        powder_cost[d["powder"]] += d["cost"]

    top_supplier = max(supplier_cost, key=supplier_cost.get, default="—")
    top_supplier_pct = supplier_cost[top_supplier] / curr_cost * 100 if curr_cost > 0 else 0
    top_powder = max(powder_qty, key=powder_qty.get, default="—")

    # ==== Title block ====
    story.append(Paragraph("Monthly Powder Usage &amp; Cost Review", ParagraphStyle(
        "t", fontName="DejaVuSans-Bold", fontSize=18, textColor=NAVY, spaceAfter=6)))
    story.append(Paragraph(f"Reporting Period: {month_str}", ParagraphStyle(
        "s", fontName="DejaVuSans", fontSize=9.5, textColor=MUTED)))
    story.append(gap(12))

    story.append(_doc_control_strip(styles, [
        ("Company", company_name),
        ("Report Type", "Monthly Review"),
        ("Report Ref.", ref_no),
        ("Classification", "Confidential"),
    ], content_width))
    story.append(gap(SECTION_GAP))

    # ==== 1. Executive summary ====
    story.append(Paragraph("1. Executive Summary", styles["SectionHeader"]))
    direction = "increased" if (mom_cost or 0) >= 0 else "decreased"
    story.append(Paragraph(
        f"In {month_str}, {company_name} consumed <b>{curr_qty:,.1f} kg</b> of powder coating material "
        f"across <b>{len(powder_qty)}</b> material type(s), at a total material cost of "
        f"<b>₹{curr_cost:,.0f}</b> — an average of <b>₹{curr_cpk:.2f}/kg</b>. Total cost {direction} "
        f"{fmt_pct(mom_cost)} compared to the prior month. <b>{top_powder}</b> was the most consumed "
        f"material this period, and <b>{top_supplier}</b> accounted for {top_supplier_pct:.1f}% of total "
        f"supplier spend.",
        styles["Insight"]
    ))
    story.append(gap(BLOCK_GAP))

    card_w = (content_width - 16) / 3
    kpi_row = Table([[
        _kpi_card(styles, "Consumption (kg)", f"{curr_qty:,.1f}", f"{fmt_pct(mom_qty)} MoM · {fmt_pct(pct(curr_qty, yoy_qty))} YoY", pct_color(mom_qty), card_w),
        _kpi_card(styles, "Total Cost", f"₹{curr_cost:,.0f}", f"{fmt_pct(mom_cost)} MoM · {fmt_pct(pct(curr_cost, yoy_cost))} YoY", pct_color(mom_cost), card_w),
        _kpi_card(styles, "Avg Cost / kg", f"₹{curr_cpk:.2f}", f"{fmt_pct(mom_cpk)} MoM · {fmt_pct(pct(curr_cpk, yoy_cpk))} YoY", pct_color(-(mom_cpk) if mom_cpk is not None else None), card_w),
    ]], colWidths=[card_w, card_w, card_w])
    kpi_row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    story.append(kpi_row)
    story.append(gap(SECTION_GAP))

    # ==== 2. Period comparison ====
    table_data = [
        ["Metric", "This Month", "Prior Month", "MoM", "Same Month LY", "YoY"],
        ["Consumption (kg)", f"{curr_qty:,.1f}", f"{prev_qty:,.1f}", fmt_pct(mom_qty), f"{yoy_qty:,.1f}", fmt_pct(pct(curr_qty, yoy_qty))],
        ["Total Cost (₹)", f"{curr_cost:,.0f}", f"{prev_cost:,.0f}", fmt_pct(mom_cost), f"{yoy_cost:,.0f}", fmt_pct(pct(curr_cost, yoy_cost))],
        ["Avg Cost / kg (₹)", f"{curr_cpk:.2f}", f"{prev_cpk:.2f}", fmt_pct(mom_cpk), f"{yoy_cpk:.2f}", fmt_pct(pct(curr_cpk, yoy_cpk))],
    ]
    table = Table(table_data, colWidths=[128, 78, 78, 58, 90, 58], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "DejaVuSans"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BAND]),
    ]))
    story.append(KeepTogether([Paragraph("2. Period Comparison", styles["SectionHeader"]), table]))
    story.append(gap(SECTION_GAP))

    # ==== 3. Material-wise consumption ====
    mat_rows = []
    for powder, qty in sorted(powder_qty.items(), key=lambda x: -x[1]):
        cost = powder_cost[powder]
        rate = cost / qty if qty else 0
        share = qty / curr_qty * 100 if curr_qty else 0
        mat_rows.append([powder, f"{qty:,.1f}", f"₹{rate:,.2f}", f"₹{cost:,.0f}", f"{share:.1f}%"])
    mat_table = _breakdown_table(
        ["Material", "Qty (kg)", "Avg Rate/kg", "Cost (₹)", "% of Volume"],
        mat_rows, [190, 75, 85, 90, 80]
    )
    story.append(KeepTogether([Paragraph("3. Material-wise Consumption", styles["SectionHeader"]), mat_table]))
    story.append(gap(SECTION_GAP))

    # ==== 4. Supplier-wise cost breakdown ====
    sup_rows = []
    for sup, cost in sorted(supplier_cost.items(), key=lambda x: -x[1]):
        share = cost / curr_cost * 100 if curr_cost else 0
        sup_rows.append([sup, f"₹{cost:,.0f}", f"{share:.1f}%"])
    sup_table = _breakdown_table(
        ["Supplier", "Cost (₹)", "% of Spend"], sup_rows, [280, 130, 110]
    )
    story.append(KeepTogether([Paragraph("4. Supplier-wise Cost Breakdown", styles["SectionHeader"]), sup_table]))
    story.append(gap(SECTION_GAP))

    # ==== 5. 6-month trend ====
    months, cpk_trend = [], []
    for i in range(5, -1, -1):
        m_start = (curr_start - relativedelta(months=i)).replace(day=1)
        m_end = m_start + relativedelta(months=1) - timedelta(seconds=1)
        m_data = get_fifo_data(company_id, m_start, m_end)
        _, _, cpk = metrics(m_data)
        months.append(m_start.strftime("%b %y"))
        cpk_trend.append(cpk)

    fig, ax = plt.subplots(figsize=(5.6, 2.3))
    ax.plot(months, cpk_trend, marker="o", color="#0B1F3A", linewidth=1.8, markersize=4)
    ax.fill_between(months, cpk_trend, alpha=0.06, color="#0B1F3A")
    ax.set_ylabel("₹ / kg", fontsize=8.5)
    ax.grid(True, alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)
    plt.xticks(fontsize=8)
    plt.yticks(fontsize=8)

    chart_path = tempfile.mktemp(".png")
    fig.savefig(chart_path, dpi=170, bbox_inches="tight")
    plt.close(fig)

    section5 = [
        Paragraph("5. Six-Month Cost Trend", styles["SectionHeader"]),
        Image(chart_path, width=5.4 * inch, height=2.2 * inch),
        Spacer(1, 4),
        Paragraph(
            "Average cost per kg over the trailing six months, computed from FIFO-based usage allocations.",
            styles["FinePrint"]
        ),
    ]
    story.append(KeepTogether(section5))
    story.append(gap(SECTION_GAP))

    # ==== 6. Key insights ====
    story.append(Paragraph("6. Key Insights &amp; Recommended Actions", styles["SectionHeader"]))
    story.append(Paragraph(f"• Average cost per kg is ₹{curr_cpk:.2f} ({fmt_pct(mom_cpk)} MoM).", styles["Insight"]))
    risk_note = "This represents a supplier concentration risk — diversification is advised." \
        if top_supplier_pct > 60 else "Supplier exposure is within an acceptable range."
    story.append(Paragraph(
        f"• Supplier concentration: <b>{top_supplier}</b> accounts for {top_supplier_pct:.1f}% of spend. {risk_note}",
        styles["Insight"]))
    story.append(Paragraph(
        f"• <b>{top_powder}</b> was the highest-volume material consumed this period.",
        styles["Insight"]))
    story.append(gap(SECTION_GAP + 6))

    # ==== 7. Approval & sign-off ====
    story.append(Paragraph("7. Approval &amp; Sign-off", styles["SectionHeader"]))
    col_w = content_width / 2
    sign_table = Table([[
        [HRFlowable(width="80%", thickness=0.8, color=BORDER), Spacer(1, 4),
         Paragraph("Prepared by", styles["SigLabel"]),
         Paragraph("Powder Management System", styles["SigName"]),
         Paragraph("Auto-generated report", styles["SigRole"])],
        [HRFlowable(width="80%", thickness=0.8, color=BORDER), Spacer(1, 4),
         Paragraph("Reviewed &amp; Approved by", styles["SigLabel"]),
         Paragraph(director_name, styles["SigName"]),
         Paragraph("Founder &amp; Managing Director", styles["SigRole"])],
    ]], colWidths=[col_w, col_w])
    sign_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ]))
    story.append(sign_table)
    story.append(gap(18))
    story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "This is a system-generated report derived from FIFO-based inventory and usage records "
        "maintained in the company's Powder Management system. Figures are subject to review and "
        "reconciliation prior to statutory or bank submission.",
        styles["FinePrint"]))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return pdf_path
