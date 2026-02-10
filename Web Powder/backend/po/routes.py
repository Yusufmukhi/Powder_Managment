from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse
from po.purchase_order import create_po, cancel_po, deliver_po, list_pos
from po.po_pdf import generate_po_pdf

router = APIRouter(prefix="/po", tags=["Purchase Orders"])


@router.post("/create")
def create_po_api(request: Request, payload: dict):
    company_id = request.headers.get("X-Company-Id")
    user_id = payload.get("user_id")

    if not company_id or not user_id:
        raise HTTPException(400, "Missing company_id or user_id in request")

    return create_po(company_id, user_id, payload)


@router.post("/cancel/{po_id}")
def cancel_po_api(request: Request, po_id: str, payload: dict):
    company_id = request.headers.get("X-Company-Id")
    user_id = payload.get("user_id")

    if not company_id or not user_id:
        raise HTTPException(400, "Missing company_id or user_id")

    return cancel_po(company_id, po_id, user_id)


@router.post("/deliver/{po_id}")
def deliver_po_api(request: Request, po_id: str, payload: dict):
    company_id = request.headers.get("X-Company-Id")
    user_id = payload.get("user_id")

    if not company_id or not user_id:
        raise HTTPException(400, "Missing company_id or user_id")

    return deliver_po(company_id, po_id, user_id)


@router.get("/list")
def list_po_api(request: Request):
    company_id = request.headers.get("X-Company-Id")
    if not company_id:
        raise HTTPException(400, "X-Company-Id header missing")
    return list_pos(company_id)


@router.get("/pdf/{po_id}")
def download_po_pdf(request: Request, po_id: str):
    company_id = request.headers.get("X-Company-Id")
    if not company_id:
        raise HTTPException(400, "X-Company-Id header missing")

    print(f"[PDF] Generating PDF for PO {po_id} | Company: {company_id}")

    try:
        file_path = generate_po_pdf(po_id)
        print(f"[PDF] Success - file generated: {file_path}")
        return FileResponse(
            file_path,
            media_type="application/pdf",
            filename=f"PO-{po_id[:8]}.pdf"
        )
    except Exception as e:
        print(f"[PDF ERROR] Failed for PO {po_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")