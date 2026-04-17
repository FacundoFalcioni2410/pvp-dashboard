from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import pandas as pd
import sqlite3
import io
import json
import os
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path

app = FastAPI(title="Excel Price Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PCT_DIF_COL = "% Dif con PVP"
RAZON_SOCIAL_COL = "RAZON SOCIAL"
USUARIO_ML_COL = "USUARIO ML"
TIPO_CLIENTE_COL = "TIPO DE CLIENTE"
FECHA_COL = "FECHA"
MLA_COL = "MLA"
PRECIO_COL = "Precio"
SKU_COL = "SKU"
PVP_COL = "PVP"

BACKEND_DIR = Path(__file__).parent
DATASETS_DIR = BACKEND_DIR / "datasets"
CATALOG_PATH = DATASETS_DIR / "catalog.db"
LEGACY_DB_PATH = BACKEND_DIR / "data.db"


# ---------------------------------------------------------------------------
# Catalog helpers
# ---------------------------------------------------------------------------

def ensure_catalog():
    DATASETS_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(CATALOG_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS datasets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            filename TEXT,
            created_at TEXT NOT NULL,
            row_count INTEGER DEFAULT 0,
            sheets TEXT DEFAULT '[]'
        )
    """)
    # Add sheets column if it doesn't exist (migration for existing DBs)
    try:
        conn.execute("ALTER TABLE datasets ADD COLUMN sheets TEXT DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass
    conn.execute("""
        CREATE TABLE IF NOT EXISTS thresholds (
            mla TEXT PRIMARY KEY,
            allowed_pct REAL NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def get_catalog_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def list_datasets_from_catalog() -> list[dict]:
    conn = get_catalog_conn()
    try:
        rows = conn.execute(
            "SELECT id, name, filename, created_at, row_count, sheets FROM datasets ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_dataset_in_catalog(name: str, filename: str, row_count: int, sheets: list[str] = None) -> int:
    conn = get_catalog_conn()
    try:
        cur = conn.execute(
            "INSERT INTO datasets (name, filename, created_at, row_count, sheets) VALUES (?, ?, ?, ?, ?)",
            (name, filename, datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"), row_count, json.dumps(sheets or [])),
        )
        dataset_id = cur.lastrowid
        conn.commit()
        return dataset_id
    finally:
        conn.close()


def get_thresholds() -> dict[str, float]:
    conn = get_catalog_conn()
    try:
        rows = conn.execute("SELECT mla, allowed_pct FROM thresholds").fetchall()
        return {r[0]: r[1] for r in rows}
    finally:
        conn.close()


def get_threshold_count() -> int:
    conn = get_catalog_conn()
    try:
        return conn.execute("SELECT COUNT(*) FROM thresholds").fetchone()[0]
    finally:
        conn.close()


def upsert_thresholds(entries: list[tuple[str, float]]) -> int:
    conn = get_catalog_conn()
    try:
        conn.executemany(
            "INSERT INTO thresholds (mla, allowed_pct) VALUES (?, ?) "
            "ON CONFLICT(mla) DO UPDATE SET allowed_pct = excluded.allowed_pct",
            entries,
        )
        conn.commit()
        return conn.execute("SELECT COUNT(*) FROM thresholds").fetchone()[0]
    finally:
        conn.close()


def delete_dataset_from_catalog(dataset_id: int):
    conn = get_catalog_conn()
    try:
        conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()
    finally:
        conn.close()
    db_path = DATASETS_DIR / f"{dataset_id}.db"
    if db_path.exists():
        db_path.unlink()


# ---------------------------------------------------------------------------
# Per-dataset database helpers
# ---------------------------------------------------------------------------

def get_dataset_conn(dataset_id: int) -> sqlite3.Connection:
    db_path = DATASETS_DIR / f"{dataset_id}.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def populate_dataset_db(dataset_id: int, df: pd.DataFrame, sheet_name: str = None) -> None:
    conn = get_dataset_conn(dataset_id)
    try:
        # Store all sheets in separate tables named after the sheet
        if sheet_name:
            table_name = f"sheet_{sheet_name.replace(' ', '_').replace('-', '_')}"
            conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            col_defs = ", ".join(f'"{c}" TEXT' for c in df.columns)
            conn.execute(f"CREATE TABLE {table_name} ({col_defs})")
            if FECHA_COL in df.columns:
                conn.execute(f'CREATE INDEX IF NOT EXISTS idx_fecha_{sheet_name[:3]} ON {table_name} ("{FECHA_COL}")')
            df.to_sql(table_name, conn, if_exists="append", index=False)
        else:
            # Legacy single-table format
            conn.execute("DROP TABLE IF EXISTS rows")
            col_defs = ", ".join(f'"{c}" TEXT' for c in df.columns)
            conn.execute(f"CREATE TABLE rows ({col_defs})")
            conn.execute(f'CREATE INDEX idx_fecha ON rows ("{FECHA_COL}")')
            df.to_sql("rows", conn, if_exists="append", index=False)
        conn.commit()
    finally:
        conn.close()


def query_dataset_rows(dataset_id: int, date: str | None) -> list[dict]:
    conn = get_dataset_conn(dataset_id)
    try:
        if date:
            cur = conn.execute(
                f'SELECT * FROM rows WHERE substr("{FECHA_COL}", 1, 10) = ?', (date,)
            )
        else:
            cur = conn.execute("SELECT * FROM rows")
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def query_dataset_dates(dataset_id: int) -> list[str]:
    conn = get_dataset_conn(dataset_id)
    try:
        cur = conn.execute(
            f'SELECT DISTINCT substr("{FECHA_COL}", 1, 10) AS d FROM rows '
            f'WHERE "{FECHA_COL}" IS NOT NULL ORDER BY d DESC'
        )
        return [r[0] for r in cur.fetchall() if r[0]]
    except Exception:
        return []
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Legacy migration
# ---------------------------------------------------------------------------

def _migrate_legacy_if_needed():
    """Import old data.db as a dataset if catalog is empty."""
    if not LEGACY_DB_PATH.exists():
        return
    if list_datasets_from_catalog():
        return
    try:
        old_conn = sqlite3.connect(LEGACY_DB_PATH)
        try:
            row_count = old_conn.execute("SELECT COUNT(*) FROM rows").fetchone()[0]
        except Exception:
            old_conn.close()
            return
        if row_count == 0:
            old_conn.close()
            return
        old_conn.close()
        dataset_id = create_dataset_in_catalog("Datos importados", "data.db", row_count)
        shutil.copy2(LEGACY_DB_PATH, DATASETS_DIR / f"{dataset_id}.db")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
def startup():
    ensure_catalog()
    _migrate_legacy_if_needed()


# ---------------------------------------------------------------------------
# Score helpers
# ---------------------------------------------------------------------------

def compute_score(pct_diff, threshold: float = 15.0) -> int:
    import math
    try:
        val = float(pct_diff)
    except (TypeError, ValueError):
        return 0
    if abs(val) <= 1.5:
        val = val * 100
    abs_pct = abs(val)
    # Normalize by per-SKU threshold so that threshold% maps to the same
    # score as 15% does in the default scale (score 6).
    if threshold and threshold > 0:
        abs_pct = abs_pct * (15.0 / threshold)
    if abs_pct < 5:
        score = 10
    else:
        score = 8 - math.floor((abs_pct - 5) / 5)
    return max(1, min(10, score))

def parse_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def normalise_pct(pct_val):
    try:
        val = float(pct_val)
    except (TypeError, ValueError):
        return None
    if abs(val) <= 1.5:
        val = val * 100
    return val


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------

def _deduplicate_by_mla_day(rows: list[dict]) -> list[dict]:
    best: dict[tuple, dict] = {}
    for row in rows:
        razon = row.get(RAZON_SOCIAL_COL) or "Sin nombre"
        mla = row.get(MLA_COL) or ""
        fecha = str(row.get(FECHA_COL) or "")[:10]
        key = (razon, mla, fecha)
        abs_pct = abs(normalise_pct(row.get(PCT_DIF_COL)) or 0)
        if key not in best or abs_pct > abs(normalise_pct(best[key].get(PCT_DIF_COL)) or 0):
            best[key] = row
    return list(best.values())


def aggregate_clients(rows: list[dict]) -> list:
    client_map = defaultdict(lambda: {"scores": [], "usuario": ""})
    for row in rows:
        if (row.get(TIPO_CLIENTE_COL) or "").strip() == "CONTRABANDO":
            continue
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        usuario = (row.get(USUARIO_ML_COL) or "").strip()
        score = row.get("score")
        try:
            score = int(score)
        except (TypeError, ValueError):
            score = 0
        if score > 0:
            client_map[razon]["scores"].append(score)
            if usuario:
                client_map[razon]["usuario"] = usuario
    result = []
    for name, data in client_map.items():
        scores = data["scores"]
        result.append({
            "name": name,
            "scores": scores,
            "avgScore": round(sum(scores) / len(scores)) if scores else 0,
            "usuario": data["usuario"],
        })
    return result


def build_scatter_data(rows: list[dict], max_points: int = 500) -> list:
    scatter = []
    for row in rows:
        if (row.get(TIPO_CLIENTE_COL) or "").strip() == "CONTRABANDO":
            continue
        pct = normalise_pct(row.get(PCT_DIF_COL))
        score = row.get("score")
        if pct is not None and score is not None:
            scatter.append({
                "pct": round(abs(pct), 1),
                "score": int(score),
                "client": (row.get(RAZON_SOCIAL_COL) or "—").strip(),
            })
    if len(scatter) > max_points:
        import random
        scatter = random.sample(scatter, max_points)
    return scatter


def build_infraction_chart(rows: list[dict], threshold: int = 15) -> list:
    deduped = _deduplicate_by_mla_day(rows)
    imap = defaultdict(lambda: {"count": 0, "total": 0, "usuario": ""})
    for row in deduped:
        if (row.get(TIPO_CLIENTE_COL) or "").strip() == "CONTRABANDO":
            continue
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        pct = normalise_pct(row.get(PCT_DIF_COL))
        imap[razon]["total"] += 1
        imap[razon]["usuario"] = (row.get(USUARIO_ML_COL) or "").strip()
        if pct is not None and abs(pct) >= threshold:
            imap[razon]["count"] += 1
    results = []
    for name, d in imap.items():
        if d["total"] > 0:
            results.append({
                "name": name[:40] + "…" if len(name) > 40 else name,
                "fullName": name,
                "count": d["count"],
                "total": d["total"],
                "pctInfraccion": round(100 * d["count"] / d["total"], 1),
                "usuario": d["usuario"],
            })
    results.sort(key=lambda x: x["pctInfraccion"], reverse=True)
    return results[:20]


def build_high_deviation_chart(rows: list[dict], threshold: int = 40) -> list:
    deduped = _deduplicate_by_mla_day(rows)
    dmap = defaultdict(lambda: {"count": 0, "total": 0, "usuario": ""})
    for row in deduped:
        if (row.get(TIPO_CLIENTE_COL) or "").strip() == "CONTRABANDO":
            continue
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        pct = normalise_pct(row.get(PCT_DIF_COL))
        dmap[razon]["total"] += 1
        dmap[razon]["usuario"] = (row.get(USUARIO_ML_COL) or "").strip()
        if pct is not None and abs(pct) >= threshold:
            dmap[razon]["count"] += 1
    results = []
    for name, d in dmap.items():
        if d["total"] > 0:
            results.append({
                "name": name[:40] + "…" if len(name) > 40 else name,
                "fullName": name,
                "count": d["count"],
                "total": d["total"],
                "pctHighDeviation": round(100 * d["count"] / d["total"], 1),
                "usuario": d["usuario"],
            })
    results.sort(key=lambda x: x["pctHighDeviation"], reverse=True)
    return results[:20]


SKU_COL = "SKU"
DEFAULT_THRESHOLD = 15.0


def enrich_rows(rows: list[dict]) -> list[dict]:
    """Add allowed_pct to each row and recompute score using per-SKU threshold."""
    thresholds = get_thresholds()
    for row in rows:
        sku = str(row.get(SKU_COL) or row.get(MLA_COL) or "").strip()
        threshold = thresholds.get(sku, DEFAULT_THRESHOLD)
        row["allowed_pct"] = threshold
        row["score"] = compute_score(row.get(PCT_DIF_COL), threshold)
        # Add normalized pct so frontend doesn't need to calculate
        pct_raw = row.get(PCT_DIF_COL)
        row["normalized_pct"] = normalise_pct(pct_raw)
    return rows


def build_response(rows: list[dict]) -> str:
    rows = enrich_rows(rows)
    body = {
        "rows": rows,
        "total": len(rows),
        "clients": aggregate_clients(rows),
        "scatter": build_scatter_data(rows),
        "infractionChart": build_infraction_chart(rows),
        "highDeviationChart": build_high_deviation_chart(rows),
        "thresholdCount": get_threshold_count(),
    }
    return json.dumps(body, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload-thresholds")
async def upload_thresholds(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are accepted")

    contents = await file.read()
    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse Excel file: {e}")

    df = None
    for sheet in xl.sheet_names:
        for header_row in (0, 1):
            candidate = xl.parse(sheet, header=header_row)
            candidate.columns = [str(c).strip() for c in candidate.columns]
            cols_lower = [c.lower() for c in candidate.columns]
            has_mla = any("mla" in c or "sku" in c for c in cols_lower)
            has_pct = any(c.strip().upper() == "% PERMITIDO" for c in candidate.columns)
            if has_mla and has_pct:
                df = candidate
                break
        if df is not None:
            break

    if df is None:
        raise HTTPException(
            status_code=422,
            detail="No sheet found with an MLA column and a threshold/percentage column.",
        )

    # Identify MLA and threshold columns
    mla_col = next((c for c in df.columns if "mla" in c.lower() or "sku" in c.lower()), None)

    pct_col = next(
        (c for c in df.columns if c.strip().upper() == "% PERMITIDO" and c != mla_col),
        None,
    )

    if not mla_col or not pct_col:
        cols = list(df.columns)
        raise HTTPException(
            status_code=422,
            detail=f"Could not identify SKU/MLA and threshold columns. Found columns: {cols}"
        )

    entries = []
    for _, row in df.iterrows():
        mla = str(row[mla_col]).strip()
        try:
            pct = float(row[pct_col])
        except (ValueError, TypeError):
            continue
        if not mla or mla.lower() == "nan":
            continue
        # Convert decimal fractions (0.15 → 15)
        if abs(pct) <= 1.5:
            pct = pct * 100
        entries.append((mla, abs(pct)))

    if not entries:
        raise HTTPException(status_code=422, detail="No valid MLA/threshold rows found.")

    total = upsert_thresholds(entries)
    return {"loaded": len(entries), "total": total}


@app.get("/datasets")
def get_datasets():
    return list_datasets_from_catalog()


@app.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: int):
    datasets = list_datasets_from_catalog()
    if not any(d["id"] == dataset_id for d in datasets):
        raise HTTPException(status_code=404, detail="Dataset not found")
    delete_dataset_from_catalog(dataset_id)
    return {"deleted": dataset_id, "datasets": list_datasets_from_catalog()}


@app.get("/init")
def init():
    datasets = list_datasets_from_catalog()
    if not datasets:
        return Response(status_code=204)
    latest = datasets[0]
    dataset_id = latest["id"]
    dates = query_dataset_dates(dataset_id)
    if not dates:
        return Response(status_code=204)
    rows = query_dataset_rows(dataset_id, dates[0])
    body = json.loads(build_response(rows))
    body["dates"] = dates
    body["selectedDate"] = dates[0]
    body["datasets"] = datasets
    body["activeDatasetId"] = dataset_id
    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@app.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are accepted")

    contents = await file.read()
    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse Excel file: {e}")

    def _has_pct_col(columns):
        cols_lower = [str(c).strip().lower() for c in columns]
        return PCT_DIF_COL.lower() in cols_lower or any(PCT_DIF_COL.lower() in c for c in cols_lower)

    df = None
    for sheet in xl.sheet_names:
        for header_row in (0, 1):
            candidate = xl.parse(sheet, header=header_row)
            candidate.columns = [str(c).strip() for c in candidate.columns]
            if _has_pct_col(candidate.columns):
                df = candidate
                break
        if df is not None:
            break

    if df is None:
        raise HTTPException(
            status_code=422,
            detail=f"No sheet found containing column '{PCT_DIF_COL}'. Sheets: {xl.sheet_names}",
        )

    if PCT_DIF_COL not in df.columns:
        match = [c for c in df.columns if c.lower() == PCT_DIF_COL.lower()]
        if match:
            df.rename(columns={match[0]: PCT_DIF_COL}, inplace=True)

    df["score"] = df[PCT_DIF_COL].apply(compute_score)

    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")

    df = df.astype(str).replace("nan", None)

    # Create dataset first so we have dataset_id
    base_name = file.filename.rsplit(".", 1)[0] if "." in file.filename else file.filename
    dataset_id = create_dataset_in_catalog(base_name, file.filename, 0)

    # Store all sheets
    valid_sheets = []
    total_rows = 0
    first_sheet_df = None
    
    for sheet in xl.sheet_names:
        for header_row in (0, 1):
            try:
                sheet_df = xl.parse(sheet, header=header_row)
                sheet_df.columns = [str(c).strip() for c in sheet_df.columns]
                if _has_pct_col(sheet_df.columns):
                    # Normalize columns
                    if PCT_DIF_COL not in sheet_df.columns:
                        match = [c for c in sheet_df.columns if c.lower() == PCT_DIF_COL.lower()]
                        if match:
                            sheet_df.rename(columns={match[0]: PCT_DIF_COL}, inplace=True)
                    
                    sheet_df["score"] = sheet_df[PCT_DIF_COL].apply(compute_score)
                    for col in sheet_df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                        sheet_df[col] = sheet_df[col].dt.strftime("%Y-%m-%d")
                    sheet_df = sheet_df.astype(str).replace("nan", None)
                    
                    # Also store in legacy 'rows' table for backward compatibility
                    if first_sheet_df is None:
                        first_sheet_df = sheet_df
                    
                    populate_dataset_db(dataset_id, sheet_df, sheet)
                    valid_sheets.append(sheet)
                    total_rows += len(sheet_df)
                    break
            except Exception:
                continue

    # Update dataset with all sheets
    conn = get_catalog_conn()
    try:
        conn.execute(
            "UPDATE datasets SET sheets = ?, row_count = ? WHERE id = ?",
            (json.dumps(valid_sheets), total_rows, dataset_id)
        )
        conn.commit()
    finally:
        conn.close()

    # Also store first sheet in legacy 'rows' table for backward compatibility
    if first_sheet_df is not None:
        populate_dataset_db(dataset_id, first_sheet_df, None)

    datasets = list_datasets_from_catalog()
    dates = query_dataset_dates(dataset_id)
    latest_date = dates[0] if dates else None
    rows = query_dataset_rows(dataset_id, latest_date)

    body = json.loads(build_response(rows))
    body["dates"] = dates
    body["selectedDate"] = latest_date
    body["datasets"] = datasets
    body["activeDatasetId"] = dataset_id
    body["sheets"] = valid_sheets

    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@app.get("/data")
def get_data(date: str = Query(default=None), dataset_id: int = Query(default=None)):
    datasets = list_datasets_from_catalog()
    if not datasets:
        raise HTTPException(status_code=404, detail="No data loaded. Upload a file first.")
    if dataset_id is None:
        dataset_id = datasets[0]["id"]
    elif not any(d["id"] == dataset_id for d in datasets):
        raise HTTPException(status_code=404, detail="Dataset not found")

    dates = query_dataset_dates(dataset_id)
    resolved_date = date or (dates[0] if dates else None)
    rows = query_dataset_rows(dataset_id, resolved_date)

    body = json.loads(build_response(rows))
    body["dates"] = dates
    body["selectedDate"] = resolved_date
    body["activeDatasetId"] = dataset_id
    body["sheets"] = json.loads(datasets[0].get("sheets", "[]"))
    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@app.get("/compare")
def compare_data(
    dataset1_id: int = Query(...),
    dataset2_id: int = Query(...),
    client: str = Query(default=None),
    sku: str = Query(default=None),
):
    datasets_catalog = list_datasets_from_catalog()
    ids_map = {d["id"]: d for d in datasets_catalog}

    if dataset1_id not in ids_map or dataset2_id not in ids_map:
        raise HTTPException(status_code=400, detail="Invalid dataset IDs")
    if not client and not sku:
        raise HTTPException(status_code=400, detail="Provide 'client' or 'sku' parameter")

    def get_all_rows(dataset_id: int) -> list[dict]:
        conn = get_dataset_conn(dataset_id)
        try:
            cur = conn.execute("SELECT * FROM rows")
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, row)) for row in cur.fetchall()]
            return enrich_rows(rows)
        finally:
            conn.close()

    def avg_pct_by_group(rows: list[dict], group_col: str, filter_col: str, filter_val: str) -> dict:
        groups = defaultdict(list)
        for r in rows:
            if str(r.get(filter_col) or "").strip() != filter_val:
                continue
            key = str(r.get(group_col) or "").strip()
            if not key:
                continue
            pct = r.get("normalized_pct")
            if pct is not None:
                try:
                    groups[key].append(float(pct))
                except (ValueError, TypeError):
                    pass
        return {k: (round(sum(v) / len(v), 1), len(v)) for k, v in groups.items() if v}

    rows1 = get_all_rows(dataset1_id)
    rows2 = get_all_rows(dataset2_id)

    if client:
        group_col = SKU_COL
        filter_col = RAZON_SOCIAL_COL
        filter_val = client
    else:
        group_col = RAZON_SOCIAL_COL
        filter_col = SKU_COL
        filter_val = sku

    map1 = avg_pct_by_group(rows1, group_col, filter_col, filter_val)
    map2 = avg_pct_by_group(rows2, group_col, filter_col, filter_val)

    all_keys = set(map1.keys()) | set(map2.keys())
    items = []
    for key in all_keys:
        entry1 = map1.get(key)
        entry2 = map2.get(key)
        avg1 = entry1[0] if entry1 else None
        count1 = entry1[1] if entry1 else 0
        avg2 = entry2[0] if entry2 else None
        count2 = entry2[1] if entry2 else 0
        delta = round(avg1 - avg2, 1) if avg1 is not None and avg2 is not None else None
        items.append({
            "key": key,
            "avg1": avg1,
            "count1": count1,
            "avg2": avg2,
            "count2": count2,
            "delta": delta,
            "in_both": avg1 is not None and avg2 is not None,
        })

    items.sort(
        key=lambda x: (not x["in_both"], abs(x["delta"]) if x["delta"] is not None else 0),
        reverse=True,
    )

    return Response(content=json.dumps({
        "dataset1_name": ids_map[dataset1_id]["name"],
        "dataset2_name": ids_map[dataset2_id]["name"],
        "items": items,
    }, ensure_ascii=False), media_type="application/json")
