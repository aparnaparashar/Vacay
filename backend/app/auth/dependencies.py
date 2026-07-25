from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
import jwt
import os
import base64
import ssl
import certifi
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.database import get_db
from app.db.models import User
from clerk_backend_api import Clerk

# Initialize Clerk SDK
clerk = Clerk(bearer_auth=os.environ.get("CLERK_SECRET_KEY"))
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def get_jwks_url():
    pk = os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
    if pk:
        try:
            if pk.startswith("pk_test_") or pk.startswith("pk_live_"):
                decoded = base64.b64decode(pk[8:] + '==').decode('utf-8')
                domain = decoded.rstrip('$')
                return f"https://{domain}/.well-known/jwks.json"
        except Exception as e:
            print("Error decoding publishable key:", e)
    return None

jwks_url = get_jwks_url()
ssl_context = ssl.create_default_context(cafile=certifi.where())
jwks_client = jwt.PyJWKClient(jwks_url, ssl_context=ssl_context) if jwks_url else None

_clerk_id_to_email = {}

def get_email_from_clerk(clerk_user_id: str) -> str:
    if clerk_user_id in _clerk_id_to_email:
        return _clerk_id_to_email[clerk_user_id]
    try:
        user = clerk.users.get(user_id=clerk_user_id)
        if user and user.email_addresses:
            email = user.email_addresses[0].email_address
            _clerk_id_to_email[clerk_user_id] = email
            return email
    except Exception as e:
        print(f"Error fetching from Clerk: {e}")
    return None

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    try:
        if jwks_client:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(token, signing_key.key, algorithms=["RS256"])
        else:
            # Fallback if JWKS client fails to initialize (shouldn't happen if env is set)
            payload = jwt.decode(token, options={"verify_signature": False})
            
        clerk_user_id: str = payload.get("sub")
        if not clerk_user_id:
            raise credentials_exception
            
    except Exception as e:
        print("JWT Verification Error:", e)
        raise credentials_exception
        
    email = get_email_from_clerk(clerk_user_id)
    if not email:
        raise credentials_exception
        
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None:
        user = User(email=email, name=email.split("@")[0], is_verified=True)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user

async def get_current_user_optional(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    if not token:
        return None
    try:
        if jwks_client:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(token, signing_key.key, algorithms=["RS256"])
        else:
            payload = jwt.decode(token, options={"verify_signature": False})
            
        clerk_user_id: str = payload.get("sub")
        if clerk_user_id:
            email = get_email_from_clerk(clerk_user_id)
            if email:
                result = await db.execute(select(User).where(User.email == email))
                return result.scalars().first()
    except Exception as e:
        print("Optional Auth Error:", e)
    return None
