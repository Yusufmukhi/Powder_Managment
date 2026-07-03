# utils/fonts.py  (create this file if needed)
import os

def get_font_path(filename: str) -> str:
    # Try multiple strategies so it works in dev + Render + different imports
    this_dir = os.path.dirname(os.path.abspath(__file__))          # .../backend/utils
    backend_dir = os.path.dirname(this_dir)                        # .../backend

    base_candidates = [
        # Correct location: backend/assets/fonts (this file lives in backend/utils)
        backend_dir,

        # Fallback: same directory as this file (in case fonts get moved here)
        this_dir,

        # Current working dir fallback (least reliable — depends on how the
        # process was launched, e.g. Render's start command / root directory)
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
