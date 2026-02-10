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
from utils.fonts import get_font_path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

def register_fonts():
    pdfmetrics.registerFont(
        TTFont("DejaVuSans", get_font_path("DejaVuSans.ttf"))
    )
    pdfmetrics.registerFont(
        TTFont("DejaVuSans-Bold", get_font_path("DejaVuSans-Bold.ttf"))
    )
    registerFontFamily(
        family="DejaVuSans",
        normal="DejaVuSans",
        bold="DejaVuSans-Bold"
    )


def generate_po_pdf(po_id: str) -> str:
    register_fonts()  # from your utils/fonts.py

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
                email,
                gstin,
                signature_url
            )
        """) \
        .eq("id", po_id) \
        .single() \
        .execute().data

    if not po:
        raise ValueError("PO not found")

    company = po.get("companies") or {}

    # ---- SUPPLIER ----
    supplier = None
    if po.get("supplier_id"):
        supplier = supabase.table("suppliers") \
            .select("supplier_name, address, city, state, pincode, phone, email, gstin") \
            .eq("id", po["supplier_id"]) \
            .single() \
            .execute().data

    # ---- ITEMS ----
    items = supabase.table("purchase_order_items") \
        .select("""
            quantity_kg,
            rate_per_kg,
            amount,
            powder:powders!powder_id (powder_name)
        """) \
        .eq("po_id", po_id) \
        .execute().data or []

    # ---- TEMP FILE ----
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    pdf_path = tmp.name
    tmp.close()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=30*mm,
        rightMargin=30*mm,
        topMargin=25*mm,
        bottomMargin=25*mm
    )

    styles = getSampleStyleSheet()

    # Override default styles with DejaVuSans
    for style_name in styles.byName:
        styles[style_name].fontName = "DejaVuSans"

    # Custom styles
    styles.add(ParagraphStyle(
        name='POHeader',
        fontName='DejaVuSans-Bold',
        fontSize=16,
        alignment=TA_CENTER,
        spaceAfter=6
    ))

    styles.add(ParagraphStyle(
        name='POSubHeader',
        fontName='DejaVuSans-Bold',
        fontSize=12,
        alignment=TA_CENTER,
        spaceAfter=18,
        textColor=colors.darkblue
    ))

    styles.add(ParagraphStyle(
        name='LabelBold',
        fontName='DejaVuSans-Bold',
        fontSize=10,
        spaceAfter=4
    ))

    styles.add(ParagraphStyle(
        name='NormalSmall',
        fontName='DejaVuSans',
        fontSize=9,
        leading=12
    ))

    story = []

    # ================= HEADER =================
    story.append(Paragraph("PURCHASE ORDER", styles['POHeader']))
    story.append(Paragraph(f"PO No: {po['po_number']}", styles['POSubHeader']))
    story.append(Spacer(1, 6))

    # Date
    story.append(Paragraph(
        f"<b>Date:</b> {po['po_date'] or datetime.now().strftime('%d/%m/%Y')}",
        styles['LabelBold']
    ))
    story.append(Spacer(1, 18))

    # ================= FROM / TO TABLE =================
    from_text = f"""
    <b>From:</b><br/>
    {company.get('company_name', 'N/A')}<br/>
    {company.get('address', '')}<br/>
    {company.get('city', '')}, {company.get('state', '')} - {company.get('pincode', '')}<br/>
    GSTIN: {company.get('gstin', 'N/A')}<br/>
    Phone: {company.get('phone', 'N/A')}
    """

    to_text = f"""
    <b>To:</b><br/>
    {po['supplier_name']}<br/>
    """

    if supplier:
        to_text += f"""
        {supplier.get('address', '')}<br/>
        {supplier.get('city', '')}, {supplier.get('state', '')} - {supplier.get('pincode', '')}<br/>
        GSTIN: {supplier.get('gstin', 'N/A')}<br/>
        Phone: {supplier.get('phone', 'N/A')}
        """

    from_para = Paragraph(from_text, styles['NormalSmall'])
    to_para = Paragraph(to_text, styles['NormalSmall'])

    story.append(Table(
        [[from_para, to_para]],
        colWidths=[doc.width/2, doc.width/2],
        style=[
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (0,0), 0),
            ('RIGHTPADDING', (1,0), (1,0), 0),
        ]
    ))

    story.append(Spacer(1, 24))

    # ================= ITEMS TABLE =================
    table_data = [
        ["#", "Description of Goods", "Quantity (kg)", "Rate (₹)", "Amount (₹)"]
    ]

    total_amount = 0.0

    for i, item in enumerate(items, 1):
        powder_name = item["powder"]["powder_name"] if item.get("powder") else "Unknown Powder"
        qty = float(item["quantity_kg"] or 0)
        rate = float(item["rate_per_kg"] or 0)
        amount = float(item["amount"] or (qty * rate))

        total_amount += amount

        table_data.append([
            str(i),
            powder_name,
            f"{qty:.2f}",
            f"{rate:.2f}",
            f"{amount:,.2f}"
        ])

    table_data.append(["", "", "", "Total:", f"{total_amount:,.2f}"])

    items_table = Table(
        table_data,
        colWidths=[10*mm, None, 35*mm, 35*mm, 40*mm],
        style=[
            ('GRID', (0,0), (-1,-1), 0.5, colors.black),
            ('BACKGROUND', (0,0), (-1,0), colors.lightblue),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,0), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'DejaVuSans-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 10),
            ('ALIGN', (2,1), (-1,-1), 'RIGHT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BACKGROUND', (-2,-1), (-1,-1), colors.lightgrey),
            ('FONTNAME', (-2,-1), (-1,-1), 'DejaVuSans-Bold'),
        ]
    )

    story.append(items_table)
    story.append(Spacer(1, 36))

    # ================= AMOUNT IN WORDS (optional) =================
    # You can add a library like num2words or simple custom function
    # For now skipping unless you want it

    # ================= SIGNATURE =================
    story.append(Spacer(1, 60))
    story.append(Paragraph("For " + company.get("company_name", "Company"), styles['LabelBold']))
    story.append(Spacer(1, 30))

    sig_block = Paragraph("___________________________<br/>Authorized Signatory", styles['NormalSmall'])
    story.append(sig_block)

    if company.get("signature_url"):
        try:
            r = requests.get(company["signature_url"], timeout=5)
            if r.status_code == 200:
                story.append(Image(BytesIO(r.content), width=40*mm, height=15*mm))
        except Exception as e:
            print(f"Could not load signature: {e}")

    # ================= FOOTER =================
    def on_page(canvas, doc):
        canvas.setFont("DejaVuSans", 8)
        canvas.drawString(
            doc.leftMargin,
            15*mm,
            f"Page {doc.page} • Confidential • Generated on {datetime.now().strftime('%d-%m-%Y %H:%M')}"
        )

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)

    return pdf_path