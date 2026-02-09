# backend/config.py
from supabase import create_client, Client
import os

# Load from environment variables (Render → Environment)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")     # usually the anon/public key

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase URL or Key in environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)