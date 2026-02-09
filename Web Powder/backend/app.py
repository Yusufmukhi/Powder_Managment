from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from reports.routes import router as reports_router   # ← this import is missing or wrong
# or wherever your routes.py lives: from reports.routes import router

app = FastAPI()

# CORS (you already have this)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://powder-managment.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ← THIS IS PROBABLY MISSING
app.include_router(reports_router, prefix="/reports")   # or without prefix if already in router
# If your router already has prefix="/reports", then just:
# app.include_router(reports_router)