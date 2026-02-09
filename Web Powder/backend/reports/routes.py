from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from session import get_company_id

from monthly import generate_monthly_pdf
from annual import generate_annual_pdf

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/monthly")
def monthly_report(
    year: int,
    month: int,
    company_id: str = Depends(get_company_id)
):
    pdf_path = generate_monthly_pdf(company_id, year, month)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"Monthly_Report_{year}_{month}.pdf"
    )


@router.get("/annual")
def annual_report(
    year: int,
    company_id: str = Depends(get_company_id)
):
    pdf_path = generate_annual_pdf(company_id, year)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"Annual_Audit_Report_{year}.pdf"
    )
