# routes.py or auth.py
from fastapi import HTTPException, APIRouter
import jwt
from datetime import datetime, timedelta, timezone

router = APIRouter()

SECRET_KEY = "your-super-secret-key-change-this"  # put in .env
ALGORITHM = "HS256"

def create_jwt(user_data: dict):
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode = {**user_data, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# In your login endpoint
@router.post("/login")
async def login(payload: dict):
    # ... your login logic ...
    user = {...}  # after successful password check

    token = create_jwt({
        "sub": user["id"],
        "company_id": user["company_id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"]
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }