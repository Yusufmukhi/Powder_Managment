# app.py

import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from reports.routes import router as reports_router
from po.routes import router as po_router   # ← this is the missing line
from settings.routes import router as settings_router
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://powder-managment.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Catch-all handler so unhandled exceptions still get CORS headers and a
# readable JSON body instead of a bare 500 that looks like a CORS failure
# in the browser console.
@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


app.include_router(reports_router)          # ← NO extra prefix here

# Then, after the reports include:
app.include_router(po_router)               # ← add this line
app.include_router(settings_router)



