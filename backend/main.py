import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.gzip import GZipMiddleware

from database import ensure_catalog
from router_data import router as data_router
from router_datasets import router as datasets_router
from router_score import router as score_router
from router_thresholds import router as thresholds_router
from security import ensure_security_tables, router as auth_router
from config import MAX_UPLOAD_BYTES
from seed_user import seed_default_user

is_vercel = os.getenv("VERCEL", "").lower() == "1"
is_production = is_vercel or os.getenv("PVP_ENV", "development").lower() == "production"
vercel_hosts = [
    os.getenv("VERCEL_URL", "").strip(),
    os.getenv("VERCEL_PROJECT_PRODUCTION_URL", "").strip(),
]
default_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
default_origins.extend(f"https://{host}" for host in vercel_hosts if host)
allowed_origins = [
    value.strip() for value in os.getenv("PVP_ALLOWED_ORIGINS", ",".join(default_origins)).split(",")
    if value.strip()
]
default_hosts = ["localhost", "127.0.0.1", "testserver", *(host for host in vercel_hosts if host)]
allowed_hosts = [
    value.strip() for value in os.getenv("PVP_ALLOWED_HOSTS", ",".join(default_hosts)).split(",")
    if value.strip()
]
if is_vercel:
    # Service-to-service calls over a Vercel Services binding (e.g. blob-api
    # calling /auth/me to validate a session) arrive with a Host header on
    # this internal domain rather than the public deployment host.
    allowed_hosts.append("*.services.vercel-infra.com")

app = FastAPI(
    title="Excel Price Dashboard API",
    docs_url=None if is_production else "/docs",
    redoc_url=None,
    openapi_url=None if is_production else "/openapi.json",
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = None
    origin = request.headers.get("origin")
    if origin and origin not in allowed_origins:
        response = JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
    content_length = request.headers.get("content-length")
    if response is None and content_length:
        try:
            if int(content_length) > MAX_UPLOAD_BYTES + 1024 * 1024:
                response = JSONResponse(status_code=413, content={"detail": "Request body is too large"})
        except ValueError:
            response = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header"})
    if response is None:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if request.url.path != "/api/health":
        response.headers["Cache-Control"] = "no-store"
    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

app.include_router(auth_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")
app.include_router(score_router, prefix="/api")
app.include_router(thresholds_router, prefix="/api")


@app.on_event("startup")
def startup():
    ensure_catalog()
    ensure_security_tables()
    seed_default_user()


@app.get("/api/health")
def health():
    return {"status": "ok"}
