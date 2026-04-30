import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import ensure_catalog, migrate_legacy_if_needed
from router_data import router as data_router
from router_datasets import router as datasets_router
from router_score import router as score_router
from router_thresholds import router as thresholds_router

app = FastAPI(title="Excel Price Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_router)
app.include_router(datasets_router)
app.include_router(score_router)
app.include_router(thresholds_router)


@app.on_event("startup")
def startup():
    ensure_catalog()
    migrate_legacy_if_needed()


@app.get("/health")
def health():
    return {"status": "ok"}
