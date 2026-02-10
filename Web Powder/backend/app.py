# app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from reports.routes import router as reports_router
from po.routes import router as po_router   # ← this is the missing line
from fastapi import FastAPI
from settings.routes import router as settings_router
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://powder-managment.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports_router)          # ← NO extra prefix here

# Then, after the reports include:
app.include_router(po_router)               # ← add this line
app.include_router(settings_router)



