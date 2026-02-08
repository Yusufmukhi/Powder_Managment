from fastapi import Header, HTTPException
from typing import Optional

def get_company_id(x_company_id: Optional[str] = Header(None)) -> str:
    if not x_company_id:
        raise HTTPException(
            status_code=400,
            detail="X-Company-Id header missing"
        )
    return x_company_id
