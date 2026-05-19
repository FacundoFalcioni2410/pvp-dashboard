import json
import math

from config import DEFAULT_THRESHOLD, MLA_COL, PCT_DIF_COL, SKU_COL
from database import get_catalog_conn, get_thresholds

DEFAULT_SCORE_BANDS: list[float] = [5.0, 10.0, 15.0, 20.0, 25.0, 30.0]

_score_config_cache: list[float] | None = None


def get_score_config() -> list[float]:
    global _score_config_cache
    if _score_config_cache is not None:
        return _score_config_cache
    conn = get_catalog_conn()
    try:
        row = conn.execute("SELECT value FROM score_config WHERE key = 'bands'").fetchone()
        _score_config_cache = json.loads(row[0]) if row else DEFAULT_SCORE_BANDS[:]
        return _score_config_cache
    finally:
        conn.close()


def save_score_config(bands: list[float]) -> None:
    global _score_config_cache
    conn = get_catalog_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO score_config (key, value) VALUES ('bands', ?)",
            (json.dumps(bands),),
        )
        conn.commit()
        _score_config_cache = bands
    finally:
        conn.close()


def compute_score(pct_diff, threshold: float = DEFAULT_THRESHOLD) -> int:
    try:
        val = float(pct_diff)
    except (TypeError, ValueError):
        return 0
    if abs(val) <= 1.5:
        val = val * 100
    abs_val = math.floor(abs(val) + 0.5)
    if abs_val < threshold:
        return 8
    bands = get_score_config()
    for i, band in enumerate(bands):
        if abs_val < threshold + band:
            return 7 - i
    return 1


def normalise_pct(pct_val):
    try:
        val = float(pct_val)
    except (TypeError, ValueError):
        return None
    if abs(val) <= 1.5:
        val = val * 100
    return val


def enrich_rows(rows: list[dict]) -> list[dict]:
    thresholds = get_thresholds()
    for row in rows:
        sku = str(row.get(SKU_COL) or row.get(MLA_COL) or "").strip()
        threshold = thresholds.get(sku, DEFAULT_THRESHOLD)
        row["allowed_pct"] = threshold
        row["score"] = compute_score(row.get(PCT_DIF_COL), threshold)
        row["normalized_pct"] = normalise_pct(row.get(PCT_DIF_COL))
    return rows
