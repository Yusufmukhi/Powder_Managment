from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# List your **real** allowed frontend origins here
origins = [
    "http://localhost:5173",                    # Vite / React dev server (common port)
    "http://127.0.0.1:5173",                    # sometimes needed
    "https://powder-managment.vercel.app",      # ← Your actual production frontend URL
    # "https://*.vercel.app",                   # ← NOT supported (see below)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,                      # Use the list above — do NOT use ["*"] if allow_credentials=True
    allow_credentials=True,                     # Keep if your app uses cookies / Authorization headers
    allow_methods=["*"],                        # Usually fine (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],                        # Usually fine
)