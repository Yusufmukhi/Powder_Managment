from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from reports.routes import router as reports_router
from po.routes import router as po_router   # ✅ REQUIRED

app = FastAPI(title="Inventory API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, PUT, DELETE
    allow_headers=["*"],          # 🔴 VERY IMPORTANT
)

# ✅ REGISTER ROUTES
app.include_router(reports_router)
app.include_router(po_router)   # ✅ THIS LINE FIXES 404
