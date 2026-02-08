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
        raise HTTPException(400, "Missing headers")

    return create_po(company_id, user_id, payload)


@router.post("/cancel/{po_id}")
def cancel_po_api(request: Request, po_id: str, payload: dict):
    return cancel_po(
        request.headers.get("X-Company-Id"),
        po_id,
        payload.get("user_id")
    )


@router.post("/deliver/{po_id}")
def deliver_po_api(request: Request, po_id: str, payload: dict):
    company_id = request.headers.get("X-Company-Id")
    user_id = payload.get("user_id")

    if not company_id or not user_id:
        raise HTTPException(400, "Missing company_id or user_id")

    return deliver_po(company_id, po_id, user_id)


@router.get("/list")
def list_po_api(request: Request):
    return list_pos(request.headers.get("X-Company-Id"))


@router.get("/pdf/{po_id}")
def download_po_pdf(request: Request, po_id: str):
    file_path = generate_po_pdf(po_id)
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=file_path.split("/")[-1]
    )
