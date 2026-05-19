"""Google OAuth 2.0 authentication."""

from __future__ import annotations

import os
import secrets

from authlib.integrations.starlette_client import OAuth  # type: ignore[import-untyped]
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from starlette.middleware.base import BaseHTTPMiddleware

router = APIRouter(prefix="/api/auth")

_SECRET_KEY = os.environ.get("SESSION_SECRET", secrets.token_hex(32))
_SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
_COOKIE_NAME = "assist_session"
_BASE_URL = os.environ.get("BASE_URL", "")

_signer = URLSafeTimedSerializer(_SECRET_KEY)

oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _get_user(request: Request) -> dict | None:
    cookie = request.cookies.get(_COOKIE_NAME)
    if not cookie:
        return None
    try:
        return _signer.loads(cookie, max_age=_SESSION_MAX_AGE)
    except BadSignature:
        return None


@router.get("/me")
async def me(request: Request) -> JSONResponse:
    user = _get_user(request)
    if not user:
        return JSONResponse(None, status_code=401)
    return JSONResponse(user)


@router.get("/login")
async def login(request: Request) -> Response:
    if _BASE_URL:
        redirect_uri = f"{_BASE_URL}/api/auth/callback"
    else:
        redirect_uri = str(request.url_for("auth_callback"))
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback", name="auth_callback")
async def callback(request: Request) -> Response:
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo", {})
    user_data = {
        "email": userinfo.get("email", ""),
        "name": userinfo.get("name", ""),
        "picture": userinfo.get("picture", ""),
    }
    signed = _signer.dumps(user_data)
    response = RedirectResponse(url=f"{_BASE_URL}/")
    response.set_cookie(
        _COOKIE_NAME,
        signed,
        max_age=_SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )
    return response


@router.post("/logout")
async def logout() -> Response:
    response = JSONResponse({"ok": True})
    response.delete_cookie(_COOKIE_NAME)
    return response


class AuthMiddleware(BaseHTTPMiddleware):
    _PUBLIC_PATHS = frozenset({"/api/auth/login", "/api/auth/callback", "/api/auth/me"})

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or path in self._PUBLIC_PATHS:
            return await call_next(request)
        user = _get_user(request)
        if not user:
            return JSONResponse({"detail": "not authenticated"}, status_code=401)
        request.state.user = user
        return await call_next(request)


def get_current_user(request: Request) -> dict:
    """FastAPI dependency — returns the authenticated user dict.
    Assumes AuthMiddleware has already set request.state.user."""
    return request.state.user
