from datetime import datetime, timedelta
from collections import defaultdict
import tempfile

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from fastapi.responses import FileResponse

from services.fifo_data import get_fifo_data
from config import supabase
from dateutil.relativedelta import relativedelta

from utils.fonts import get_font_path

# ---------------------------------------------------------
# Brand palette — kept consistent with monthly.py
# ---------------------------------------------------------
NAVY = colors.HexColor("#0B1F3A")
STEEL = colors.HexColor("#3E5C86")
LIGHT_BAND = colors.HexColor("#F4F6FA")
BORDER = colors.HexColor("#D8DEE9")
GOOD = colors.HexColor("#1E824C")
BAD = colors.HexColor("#C0392B")
MUTED = colors.HexColor("#6B7280")


def register_fonts():
    pdfmetrics.registerFont(TTFont("DejaVuSans", get_font_path("DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", get_font_path("DejaVuSans-Bold.ttf")))


def gap(h=0.25):
    return Spacer(1, h * inch)


def pct(curr, prev):
    if prev is None or prev <= 0:
        return None
    return ((curr - prev) / prev) * 100


def fmt_pct(v):
    return "N/A" if v is None else f"{v:+.1f}%"


def pct_color(v):
    if v is None:
        return MUTED
    return GOOD if v >= 0 else BAD


def metrics(data):
    qty = sum(d["qty"] for d in data)
    cost = sum(d["cost"] for d in data)
    cpk = cost / qty if qty else 0
    return qty, cost, cpk


def _styles():
    styles = getSampleStyleSheet()
    for s in styles.byName.values():
        s.fontName = "DejaVuSans"

    styles.add(ParagraphStyle(
        name="CoverCompany", fontName="DejaVuSans-Bold", fontSize=22,
        alignment=1, spaceAfter=6, textColor=NAVY
    ))
    styles.add(ParagraphStyle(
        name="CoverTitle", fontName="DejaVuSans-Bold", fontSize=15,
        alignment=1, spaceAfter=10, textColor=STEEL
    ))
    styles.add(ParagraphStyle(
        name="CoverMeta", fontName="DejaVuSans", fontSize=10.5,
        alignment=1, spaceAfter=4, textColor=MUTED
    ))
    styles.add(ParagraphStyle(
        name="CoverStamp", fontName="DejaVuSans-Bold", fontSize=9.5,
        alignment=1, textColor=colors.white
    ))
    styles.add(ParagraphStyle(
        name="SectionHeader", fontName="DejaVuSans-Bold", fontSize=12.5,
        spaceBefore=16, spaceAfter=8, textColor=NAVY
    ))
    styles.add(ParagraphStyle(
        name="ReportBody", fontName="DejaVuSans", fontSize=10, leading=15, spaceAfter=6,
        textColor=colors.HexColor("#1F2937")
    ))
    styles.add(ParagraphStyle(
        name="NoDataMessage", fontName="DejaVuSans", fontSize=11.5, leading=16,
        alignment=1, spaceAfter=12, textColor=colors.HexColor("#374151")
    ))
    styles.add(ParagraphStyle(
        name="FinePrint", fontName="DejaVuSans", fontSize=7.6, textColor=MUTED, leading=10.5
    ))
    styles.add(ParagraphStyle(
        name="TocEntry", fontName="DejaVuSans", fontSize=10.5, leading=20, textColor=colors.HexColor("#1F2937")
    ))
    return styles


def _letterhead(canvas, doc, company_name, fy_label, ref_no, show_on_cover=False):
    canvas.saveState()
    w, h = A4

    if not show_on_cover:
        canvas.setFillColor(NAVY)
        canvas.rect(0, h - 60, w, 60, stroke=0, fill=1)
        canvas.setFillColor(STEEL)
        canvas.rect(0, h - 63, w, 3, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("DejaVuSans-Bold", 11)
        canvas.drawString(doc.leftMargin, h - 28, company_name)
        canvas.setFont("DejaVuSans", 8)
        canvas.drawString(doc.leftMargin, h - 42, "Annual Powder Consumption & Cost Audit Report")
        canvas.setFont("DejaVuSans", 8)
        canvas.drawRightString(w - doc.rightMargin, h - 28, fy_label)
        canvas.setFont("DejaVuSans", 7.3)
        canvas.setFillColor(colors.HexColor("#C7D2E3"))
        canvas.drawRightString(w - doc.rightMargin, h - 42, f"Ref: {ref_no}")

    # Watermark
    canvas.saveState()
    canvas.setFont("DejaVuSans-Bold", 60)
    canvas.setFillColor(colors.Color(0.85, 0.87, 0.92, alpha=0.35))
    canvas.translate(w / 2, h / 2)
    canvas.rotate(38)
    canvas.drawCentredString(0, 0, "CONFIDENTIAL")
    canvas.restoreState()

    canvas.setFillColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, 40, w - doc.rightMargin, 40)
    canvas.setFont("DejaVuSans", 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 28, company_name)
    canvas.drawCentredString(w / 2, 28, "Confidential — For Bank / Auditor Review Only")
    canvas.drawRightString(w - doc.rightMargin, 28,
                            f"Page {canvas.getPageNumber()} · Generated {datetime.now().strftime('%d %b %Y')}")
    canvas.restoreState()


def _summary_table(curr_qty, curr_cost, curr_cpk, prev_qty, prev_cost, prev_cpk, yoy_qty, yoy_cost, yoy_cpk):
    data = [
        ["Particulars", "Current FY", "Previous FY", "YoY %"],
        ["Total Consumption (kg)", f"{curr_qty:,.1f}", f"{prev_qty:,.1f}", fmt_pct(yoy_qty)],
        ["Total Material Cost (₹)", f"{curr_cost:,.0f}", f"{prev_cost:,.0f}", fmt_pct(yoy_cost)],
        ["Average Cost / kg (₹)", f"{curr_cpk:.2f}", f"{prev_cpk:.2f}", fmt_pct(yoy_cpk)],
    ]
    t = Table(data, colWidths=[195, 105, 105, 75])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "DejaVuSans"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.3),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BAND]),
    ]))
    return t


def generate_annual_pdf(company_id: str, fy_start_year: int) -> str:
    register_fonts()
    styles = _styles()

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    pdf_path = tmp.name
    tmp.close()

    doc = SimpleDocTemplate(
        pdf_path, pagesize=A4,
        leftMargin=55, rightMargin=55, topMargin=85, bottomMargin=54
    )

    story = []

    start = datetime(fy_start_year, 4, 1)
    end = datetime(fy_start_year + 1, 3, 31, 23, 59, 59)
    fy_label = f"FY {start.year}–{str(end.year)[-2:]}"
    ref_no = f"AR-{fy_start_year}-{company_id[:8].upper()}"

    company = supabase.table("companies") \
        .select("company_name, director") \
        .eq("id", company_id).single().execute()
    company_name = company.data.get("company_name", "Company")
    director_name = company.data.get("director", "Director")

    # ────────────────────────────────────────────────
    # Data source of truth: pull once, use everywhere.
    # (Previously a separate raw "usage" count query was
    # used to decide has_data, which could disagree with
    # the FIFO-joined data actually rendered — unified here.)
    # ────────────────────────────────────────────────
    curr_data = get_fifo_data(company_id, start, end)
    has_data = len(curr_data) > 0

    def cover_footer(canvas, doc_):
        _letterhead(canvas, doc_, company_name, fy_label, ref_no, show_on_cover=True)

    def footer(canvas, doc_):
        _letterhead(canvas, doc_, company_name, fy_label, ref_no)

    if not has_data:
        story.append(Spacer(1, 1.4 * inch))
        story.append(Paragraph(company_name, styles["CoverCompany"]))
        story.append(Paragraph("Annual Powder Consumption & Cost Audit Report", styles["CoverTitle"]))
        story.append(Paragraph(fy_label, styles["CoverMeta"]))
        story.append(Spacer(1, 1 * inch))
        story.append(Paragraph("No transactions or powder usage data found for this financial year.", styles["NoDataMessage"]))
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph(
            "This report is generated automatically once at least one usage record "
            "is recorded for the selected financial year.", styles["NoDataMessage"]))
        doc.build(story, onFirstPage=cover_footer, onLaterPages=footer)
        return pdf_path

    prev_start = start.replace(year=start.year - 1)
    prev_end = end.replace(year=end.year - 1)
    prev_data = get_fifo_data(company_id, prev_start, prev_end)

    curr_qty, curr_cost, curr_cpk = metrics(curr_data)
    prev_qty, prev_cost, prev_cpk = metrics(prev_data)

    yoy_qty, yoy_cost, yoy_cpk = pct(curr_qty, prev_qty), pct(curr_cost, prev_cost), pct(curr_cpk, prev_cpk)

    supplier_cost = defaultdict(float)
    supplier_qty = defaultdict(float)
    powder_qty = defaultdict(float)
    powder_cost = defaultdict(float)
    for d in curr_data:
        supplier_cost[d["supplier"]] += d["cost"]
        supplier_qty[d["supplier"]] += d["qty"]
        powder_qty[d["powder"]] += d["qty"]
        powder_cost[d["powder"]] += d["cost"]

    top_supplier = max(supplier_cost, key=supplier_cost.get, default="—")
    top_supplier_pct = supplier_cost[top_supplier] / curr_cost * 100 if curr_cost else 0
    n_suppliers = len(supplier_cost)
    top_powder = max(powder_qty, key=powder_qty.get, default="—")

    # ──── COVER PAGE ────
    story.append(Spacer(1, 1.3 * inch))
    story.append(Paragraph(company_name, styles["CoverCompany"]))
    story.append(Paragraph("Annual Powder Consumption &amp; Cost Audit Report", styles["CoverTitle"]))
    story.append(Paragraph(fy_label, styles["CoverMeta"]))
    story.append(Paragraph(f"Report Reference: {ref_no}", styles["CoverMeta"]))
    story.append(Paragraph(f"Date of Issue: {datetime.now().strftime('%d %B %Y')}", styles["CoverMeta"]))
    story.append(Spacer(1, 0.6 * inch))

    stamp = Table([[Paragraph("CONFIDENTIAL — FOR BANK / AUDITOR REVIEW ONLY", styles["CoverStamp"])]],
                   colWidths=[doc.width])
    stamp.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.append(stamp)
    story.append(Spacer(1, 0.9 * inch))

    story.append(Paragraph("Contents", ParagraphStyle("toc_h", fontName="DejaVuSans-Bold", fontSize=10.5, textColor=MUTED, spaceAfter=6)))
    for i, label in enumerate([
        "Management Summary", "Consumption & Cost Summary", "Material-wise Consumption",
        "Risk & Supplier Concentration Analysis", "Key Insights & Recommended Actions",
        "Appendix A — Average Cost Trend", "Notes & Methodology", "Approval & Sign-off"
    ], start=1):
        story.append(Paragraph(f"{i}. {label}", styles["TocEntry"]))

    story.append(PageBreak())

    # ──── Management Summary ────
    story.append(Paragraph("1. Management Summary", styles["SectionHeader"]))
    story.append(Paragraph(
        f"This report reviews powder consumption, cost behaviour, and supplier exposure for "
        f"{fy_label} based on FIFO inventory records maintained by the company. During the year, "
        f"the company consumed <b>{curr_qty:,.1f} kg</b> of powder coating material across "
        f"<b>{len(powder_qty)}</b> material type(s), sourced from <b>{n_suppliers}</b> supplier(s), "
        f"at a total material cost of <b>₹{curr_cost:,.0f}</b>.",
        styles["ReportBody"]
    ))
    story.append(Paragraph(
        f"The highest-volume material for the year was <b>{top_powder}</b>, and the leading supplier "
        f"by spend was <b>{top_supplier}</b>, accounting for {top_supplier_pct:.1f}% of total material cost.",
        styles["ReportBody"]
    ))

    # ──── Summary Table ────
    story.append(gap(0.25))
    story.append(KeepTogether([
        Paragraph("2. Consumption &amp; Cost Summary", styles["SectionHeader"]),
        _summary_table(curr_qty, curr_cost, curr_cpk, prev_qty, prev_cost, prev_cpk, yoy_qty, yoy_cost, yoy_cpk)
    ]))

    # ──── Material-wise Consumption ────
    story.append(gap(0.3))
    mat_rows = [["Material", "Qty (kg)", "Avg Rate/kg", "Cost (₹)", "% of Volume"]]
    for powder, qty in sorted(powder_qty.items(), key=lambda x: -x[1]):
        cost = powder_cost[powder]
        rate = cost / qty if qty else 0
        share = qty / curr_qty * 100 if curr_qty else 0
        mat_rows.append([powder, f"{qty:,.1f}", f"₹{rate:,.2f}", f"₹{cost:,.0f}", f"{share:.1f}%"])
    mat_table = Table(mat_rows, colWidths=[175, 75, 85, 90, 80])
    mat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), STEEL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "DejaVuSans"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 1), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BAND]),
    ]))
    story.append(KeepTogether([Paragraph("3. Material-wise Consumption", styles["SectionHeader"]), mat_table]))

    # ──── Risk & Concentration ────
    story.append(gap(0.3))
    story.append(Paragraph("4. Risk &amp; Supplier Concentration Analysis", styles["SectionHeader"]))
    risk_line = "This indicates concentrated supplier risk and diversification is advised." \
        if top_supplier_pct > 60 else "Supplier exposure is within an acceptable range."
    story.append(Paragraph(
        f"The highest supplier, <b>{top_supplier}</b>, accounts for <b>{top_supplier_pct:.1f}%</b> "
        f"of total material spend for the year. {risk_line}",
        styles["ReportBody"]
    ))

    if supplier_cost:
        rows = [["Supplier", "Qty (kg)", "Avg Rate/kg", "Cost (₹)", "% of Spend"]]
        for sup, cost in sorted(supplier_cost.items(), key=lambda x: -x[1]):
            qty_s = supplier_qty[sup]
            rate_s = cost / qty_s if qty_s else 0
            rows.append([sup, f"{qty_s:,.1f}", f"₹{rate_s:,.2f}", f"{cost:,.0f}",
                         f"{(cost / curr_cost * 100) if curr_cost else 0:.1f}%"])
        sup_table = Table(rows, colWidths=[150, 70, 85, 90, 80])
        sup_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), STEEL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
            ("FONTNAME", (0, 1), (-1, -1), "DejaVuSans"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("ALIGN", (0, 1), (0, -1), "LEFT"),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BAND]),
        ]))
        story.append(gap(0.15))
        story.append(KeepTogether([sup_table]))

    # ──── Key Insights & Recommended Actions ────
    story.append(gap(0.3))
    story.append(Paragraph("5. Key Insights &amp; Recommended Actions", styles["SectionHeader"]))

    insight_bullets = []

    # Cost driver: was the YoY cost move mainly rate or mainly volume?
    if prev_qty and prev_cost and yoy_cpk is not None and yoy_qty is not None:
        if abs(yoy_cpk) >= abs(yoy_qty):
            driver = "changes in <b>average rate per kg</b> rather than consumption volume"
        else:
            driver = "changes in <b>consumption volume</b> rather than average rate"
        insight_bullets.append(
            f"Year-on-year cost movement ({fmt_pct(yoy_cost)}) was driven primarily by {driver}."
        )

    # Material rate dispersion
    if powder_qty:
        rates = {p: (powder_cost[p] / powder_qty[p] if powder_qty[p] else 0) for p in powder_qty}
        max_p = max(rates, key=rates.get)
        min_p = min(rates, key=rates.get)
        spread = ((rates[max_p] - rates[min_p]) / rates[min_p] * 100) if rates[min_p] else 0
        if spread > 5:
            insight_bullets.append(
                f"Average material rates ranged from ₹{rates[min_p]:,.2f}/kg (<b>{min_p}</b>) to "
                f"₹{rates[max_p]:,.2f}/kg (<b>{max_p}</b>) — a {spread:.0f}% spread. Materials priced "
                f"well above the portfolio average are worth a supplier rate review."
            )

    # Material concentration
    if powder_qty and curr_qty:
        top2 = sorted(powder_qty.items(), key=lambda x: -x[1])[:2]
        top2_share = sum(v for _, v in top2) / curr_qty * 100
        if top2_share > 55:
            insight_bullets.append(
                f"<b>{top2[0][0]}</b> and <b>{top2[1][0]}</b> together account for {top2_share:.1f}% "
                f"of annual volume — production mix is concentrated; qualifying a backup supplier for "
                f"these materials would reduce single-source risk."
            )

    # Supplier diversity
    insight_bullets.append(
        f"Material was sourced from {n_suppliers} supplier(s) this year. "
        + ("Consider qualifying an additional supplier to reduce dependency on a single source."
           if n_suppliers <= 1 else "Supplier base provides reasonable sourcing flexibility.")
    )

    # Partial-year caveat — explains why a still-open FY will look artificially low vs a full prior FY
    if end > datetime.now():
        months_elapsed = max(1, (min(datetime.now(), end).year - start.year) * 12
                              + (min(datetime.now(), end).month - start.month) + 1)
        insight_bullets.append(
            f"<b>Note:</b> {fy_label} is still in progress — this report reflects only "
            f"{months_elapsed} completed month(s) of the 12-month year. The consumption, cost, and "
            f"YoY comparisons above will understate the full-year position until the financial year "
            f"closes; treat this as a run-rate view rather than a final YoY comparison."
        )

    for b in insight_bullets:
        story.append(Paragraph(f"• {b}", styles["ReportBody"]))

    # ──── Chart ────
    story.append(PageBreak())
    story.append(Paragraph("6. Appendix A — Average Cost Trend (12 Months)", styles["SectionHeader"]))

    months, trend = [], []
    for i in range(12):
        m_start = start + relativedelta(months=i)
        m_end = m_start + relativedelta(months=1) - timedelta(seconds=1)
        data = get_fifo_data(company_id, m_start, m_end)
        _, _, cpk = metrics(data)
        months.append(m_start.strftime("%b %y"))
        trend.append(cpk)

    fig, ax = plt.subplots(figsize=(5.6, 3.0))
    ax.plot(months, trend, marker="o", color="#0B1F3A", linewidth=1.8, markersize=4)
    ax.fill_between(months, trend, alpha=0.06, color="#0B1F3A")
    ax.set_ylabel("₹ / kg", fontsize=9)
    ax.grid(True, alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)
    plt.xticks(rotation=45, ha="right", fontsize=8)
    plt.yticks(fontsize=8)

    chart_path = tempfile.mktemp(".png")
    fig.savefig(chart_path, dpi=170, bbox_inches="tight")
    plt.close(fig)

    story.append(Image(chart_path, width=5.4 * inch, height=2.9 * inch))
    story.append(gap(0.15))
    story.append(Paragraph(
        "Monthly average cost per kg across the financial year, computed from FIFO-based "
        "usage allocations.", styles["FinePrint"]
    ))

    # ──── Notes & Methodology ────
    story.append(gap(0.45))
    story.append(Paragraph("7. Notes &amp; Methodology", styles["SectionHeader"]))
    for note in [
        "<b>Costing method:</b> Material cost is computed on a First-In-First-Out (FIFO) basis — "
        "each usage entry is costed against the oldest available stock batch at its received rate.",
        "<b>Data source:</b> All figures are derived directly from stock receipt and usage records "
        "maintained in the company's Powder Management system; no manual adjustments have been applied.",
        "<b>Rounding:</b> Quantities are rounded to one decimal place and currency values to the "
        "nearest rupee; minor rounding differences may appear in derived percentages.",
        "<b>Scope:</b> This report covers powder coating material only and excludes ancillary "
        "consumables, labour, and overheads.",
    ]:
        story.append(Paragraph(f"• {note}", styles["ReportBody"]))

    # ──── Signature ────
    story.append(PageBreak())
    story.append(Paragraph("8. Approval &amp; Sign-off", styles["SectionHeader"]))
    story.append(gap(0.35))
    story.append(Paragraph(
        "We confirm that the figures presented in this report have been reviewed and represent "
        "an accurate summary of powder consumption and cost records for the financial year stated above.",
        styles["ReportBody"]
    ))
    story.append(gap(0.5))

    col_w = (doc.width) / 2
    sign_row = Table([[
        [HRFlowable(width="80%", thickness=0.8, color=BORDER), Spacer(1, 4),
         Paragraph("Prepared by", ParagraphStyle("l1", fontName="DejaVuSans", fontSize=8.5, textColor=MUTED, spaceAfter=16)),
         Paragraph("Powder Management System", ParagraphStyle("n1", fontName="DejaVuSans-Bold", fontSize=10.5, textColor=NAVY)),
         Paragraph("Auto-generated report", ParagraphStyle("r1", fontName="DejaVuSans", fontSize=8.7, textColor=MUTED)),
         Paragraph(datetime.now().strftime("%d %B %Y"), ParagraphStyle("d1", fontName="DejaVuSans", fontSize=8.7, textColor=MUTED))],
        [HRFlowable(width="80%", thickness=0.8, color=BORDER), Spacer(1, 4),
         Paragraph("Reviewed &amp; Approved by", ParagraphStyle("l2", fontName="DejaVuSans", fontSize=8.5, textColor=MUTED, spaceAfter=16)),
         Paragraph(director_name, ParagraphStyle("n2", fontName="DejaVuSans-Bold", fontSize=10.5, textColor=NAVY)),
         Paragraph("Authorized Signatory", ParagraphStyle("r2", fontName="DejaVuSans", fontSize=8.7, textColor=MUTED)),
         Paragraph(datetime.now().strftime("%d %B %Y"), ParagraphStyle("d2", fontName="DejaVuSans", fontSize=8.7, textColor=MUTED))],
    ]], colWidths=[col_w, col_w])
    sign_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(sign_row)

    story.append(gap(0.5))
    story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "This is a system-generated report derived from FIFO-based inventory and usage records "
        "maintained in the company's Powder Management system. Figures are subject to review and "
        "reconciliation prior to statutory, bank, or auditor submission.",
        styles["FinePrint"]
    ))

    doc.build(story, onFirstPage=cover_footer, onLaterPages=footer)
    return pdf_path
