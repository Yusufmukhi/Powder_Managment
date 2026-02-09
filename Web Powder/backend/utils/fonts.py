# utils/fonts.py  (create this file if needed)
import os

def get_font_path(filename: str) -> str:
    # Try multiple strategies so it works in dev + Render + different imports
    base_candidates = [
        # Most reliable: relative to this file's directory (recommended)
        os.path.dirname(os.path.abspath(__file__)),
        
        # Project root assuming standard structure
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
        
        # Current working dir fallback (less reliable)
        os.getcwd(),
    ]

    for base in base_candidates:
        candidate = os.path.join(base, "assets", "fonts", filename)
        if os.path.isfile(candidate):
            return candidate

    # Last resort – raise so you see the error in logs
    raise FileNotFoundError(
        f"Font file not found: {filename}\n"
        f"Searched in:\n" + "\n".join(os.path.join(b, "assets/fonts") for b in base_candidates)
    )