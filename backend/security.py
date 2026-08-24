import hashlib
import hmac
import logging
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from database import get_catalog_conn


SESSION_COOKIE = "pvp_session"
CSRF_COOKIE = "pvp_csrf"
SESSION_HOURS = int(os.getenv("PVP_SESSION_HOURS", "8"))
COOKIE_SECURE = os.getenv(
    "PVP_COOKIE_SECURE",
    "true" if (
        os.getenv("PVP_ENV", "development").lower() == "production"
        or os.getenv("VERCEL", "").lower() == "1"
    ) else "false",
).lower() in {"1", "true", "yes"}
PASSWORD_MIN_LENGTH = 14
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_MAXMEM = 64 * 1024 * 1024

router = APIRouter(prefix="/auth", tags=["authentication"])
_attempts: dict[str, deque[float]] = defaultdict(deque)
_dummy_password_hash: str | None = None
logger = logging.getLogger("security")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=1024)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_username(username: str) -> str:
    return username.strip().casefold()


def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must contain at least {PASSWORD_MIN_LENGTH} characters")
    if len(password) > 1024:
        raise ValueError("Password is too long")
    categories = sum(
        (
            any(c.islower() for c in password),
            any(c.isupper() for c in password),
            any(c.isdigit() for c in password),
            any(not c.isalnum() for c in password),
        )
    )
    if categories < 3:
        raise ValueError("Password must use at least three of: lowercase, uppercase, numbers, symbols")


def hash_password(password: str) -> str:
    validate_password(password)
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
        maxmem=SCRYPT_MAXMEM, dklen=32,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
            maxmem=SCRYPT_MAXMEM, dklen=len(bytes.fromhex(expected)),
        )
        return hmac.compare_digest(derived, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def ensure_security_tables() -> None:
    conn = get_catalog_conn()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                normalized_username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                password_changed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                csrf_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        """)
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (_iso(_utcnow()),))
        conn.commit()
    finally:
        conn.close()


def create_user(username: str, password: str, replace: bool = False) -> None:
    display_name = username.strip()
    normalized = normalize_username(username)
    if not normalized or len(display_name) > 64:
        raise ValueError("Username must contain between 1 and 64 characters")
    password_hash = hash_password(password)
    now = _iso(_utcnow())
    conn = get_catalog_conn()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE normalized_username = ?", (normalized,)
        ).fetchone()
        if existing and not replace:
            raise ValueError("User already exists")
        if existing:
            conn.execute(
                "UPDATE users SET username = ?, password_hash = ?, active = 1, password_changed_at = ? WHERE id = ?",
                (display_name, password_hash, now, existing[0]),
            )
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (existing[0],))
        else:
            conn.execute(
                "INSERT INTO users (username, normalized_username, password_hash, role, active, created_at, password_changed_at) "
                "VALUES (?, ?, ?, 'admin', 1, ?, ?)",
                (display_name, normalized, password_hash, now, now),
            )
        conn.commit()
    finally:
        conn.close()


def seed_user_with_hash(username: str, password_hash: str) -> bool:
    """Create one user without ever placing its plaintext password in source control."""
    display_name = username.strip()
    normalized = normalize_username(username)
    if not normalized or len(display_name) > 64:
        raise ValueError("Username must contain between 1 and 64 characters")
    try:
        algorithm, n, r, p, salt, derived = password_hash.split("$", 5)
        valid_hash = (
            algorithm == "scrypt"
            and (int(n), int(r), int(p)) == (SCRYPT_N, SCRYPT_R, SCRYPT_P)
            and len(bytes.fromhex(salt)) == 16
            and len(bytes.fromhex(derived)) == 32
        )
    except (ValueError, TypeError):
        valid_hash = False
    if not valid_hash:
        raise ValueError("Invalid password hash")

    now = _iso(_utcnow())
    conn = get_catalog_conn()
    try:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO users "
            "(username, normalized_username, password_hash, role, active, created_at, password_changed_at) "
            "VALUES (?, ?, ?, 'admin', 1, ?, ?) RETURNING id",
            (display_name, normalized, password_hash, now, now),
        )
        created = cursor.fetchone() is not None
        conn.commit()
        return created
    finally:
        conn.close()


def user_count() -> int:
    conn = get_catalog_conn()
    try:
        return conn.execute("SELECT COUNT(*) FROM users WHERE active = 1").fetchone()[0]
    finally:
        conn.close()


def _client_keys(request: Request, username: str) -> tuple[str, str]:
    address = request.client.host if request.client else "unknown"
    return f"ip:{address}", f"account:{address}:{normalize_username(username)}"


def _check_rate_limit(key: str) -> None:
    now = time.monotonic()
    attempts = _attempts[key]
    while attempts and attempts[0] < now - 15 * 60:
        attempts.popleft()
    if len(attempts) >= 5:
        retry_after = max(1, int(15 * 60 - (now - attempts[0])))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def _set_auth_cookies(response: Response, session_token: str, csrf_token: str) -> None:
    max_age = SESSION_HOURS * 60 * 60
    common = {"secure": COOKIE_SECURE, "samesite": "strict", "path": "/", "max_age": max_age}
    response.set_cookie(SESSION_COOKIE, session_token, httponly=True, **common)
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, **common)


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", secure=COOKIE_SECURE, samesite="strict")
    response.delete_cookie(CSRF_COOKIE, path="/", secure=COOKIE_SECURE, samesite="strict")


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    conn = get_catalog_conn()
    try:
        cursor = conn.execute(
            "SELECT u.id, u.username, u.role, u.active, s.csrf_hash, s.expires_at "
            "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (_token_hash(token),),
        )
        raw = cursor.fetchone()
        row = dict(zip((column[0] for column in cursor.description), raw)) if raw else None
        if not row or not row["active"] or row["expires_at"] <= _iso(_utcnow()):
            if row:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
                conn.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
        return row
    finally:
        conn.close()


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_csrf(request: Request, user: CurrentUser) -> dict:
    cookie_token = request.cookies.get(CSRF_COOKIE, "")
    header_token = request.headers.get("X-CSRF-Token", "")
    if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    if not hmac.compare_digest(_token_hash(cookie_token), user["csrf_hash"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return user


CsrfUser = Annotated[dict, Depends(require_csrf)]


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response):
    global _dummy_password_hash
    if user_count() == 0:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No user configured")
    keys = _client_keys(request, payload.username)
    for key in keys:
        _check_rate_limit(key)
    conn = get_catalog_conn()
    try:
        cursor = conn.execute(
            "SELECT id, username, role, password_hash, active FROM users WHERE normalized_username = ?",
            (normalize_username(payload.username),),
        )
        raw = cursor.fetchone()
        user = dict(zip((column[0] for column in cursor.description), raw)) if raw else None
        if _dummy_password_hash is None:
            _dummy_password_hash = hash_password("Invalid-Account-Password-9284!")
        valid = verify_password(payload.password, user["password_hash"] if user else _dummy_password_hash)
        if not user or not user["active"] or not valid:
            for key in keys:
                _attempts[key].append(time.monotonic())
            logger.warning("Rejected login from %s", request.client.host if request.client else "unknown")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        for key in keys:
            _attempts.pop(key, None)
        session_token = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)
        now = _utcnow()
        expires = now + timedelta(hours=SESSION_HOURS)
        conn.execute("DELETE FROM sessions WHERE user_id = ? OR expires_at <= ?", (user["id"], _iso(now)))
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (_token_hash(session_token), user["id"], _token_hash(csrf_token), _iso(now), _iso(expires)),
        )
        conn.commit()
        _set_auth_cookies(response, session_token, csrf_token)
        logger.info("User %s signed in", user["username"])
        return {"user": {"username": user["username"], "role": user["role"]}}
    finally:
        conn.close()


@router.get("/me")
def me(user: CurrentUser):
    return {"user": {"username": user["username"], "role": user["role"]}}


@router.post("/logout")
def logout(request: Request, response: Response, user: CsrfUser):
    token = request.cookies.get(SESSION_COOKIE, "")
    conn = get_catalog_conn()
    try:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
        conn.commit()
    finally:
        conn.close()
    _clear_auth_cookies(response)
    return {"ok": True}


@router.put("/password")
def change_password(payload: PasswordChangeRequest, request: Request, response: Response, user: CsrfUser):
    try:
        validate_password(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    conn = get_catalog_conn()
    try:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not verify_password(payload.current_password, row[0]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if verify_password(payload.new_password, row[0]):
            raise HTTPException(status_code=400, detail="New password must be different")
        conn.execute(
            "UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?",
            (hash_password(payload.new_password), _iso(_utcnow()), user["id"]),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        conn.commit()
    finally:
        conn.close()
    _clear_auth_cookies(response)
    return {"ok": True}
