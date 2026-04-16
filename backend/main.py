from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import pandas as pd
import sqlite3
import io
import json
import os
from collections import defaultdict

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

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def reset_db(df: pd.DataFrame) -> None:
    """Drop and recreate the rows table, then insert all rows from df."""
    conn = get_conn()
    try:
        conn.execute("DROP TABLE IF EXISTS rows")
        # Build CREATE TABLE from df columns
        col_defs = ", ".join(f'"{c}" TEXT' for c in df.columns)
        conn.execute(f"CREATE TABLE rows ({col_defs})")
        conn.execute(f'CREATE INDEX idx_fecha ON rows ("{FECHA_COL}")')
        df.to_sql("rows", conn, if_exists="append", index=False)
        conn.commit()
    finally:
        conn.close()


def query_rows(date: str | None) -> list[dict]:
    conn = get_conn()
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


def query_dates() -> list[str]:
    conn = get_conn()
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
# Score helpers
# ---------------------------------------------------------------------------

def compute_score(pct_diff) -> int:
    import math
    try:
        val = float(pct_diff)
    except (TypeError, ValueError):
        return 0
    if abs(val) <= 1.5:
        val = val * 100
    abs_pct = abs(val)
    if abs_pct < 5:
        score = 10
    else:
        score = 8 - math.floor((abs_pct - 5) / 5)
    return max(1, min(10, score))


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
    """Each (RAZON SOCIAL, MLA, FECHA) counts as one publication.
    When duplicates exist, keep the row with the highest absolute deviation."""
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


def build_response(rows: list[dict]) -> str:
    body = {
        "rows": rows,
        "total": len(rows),
        "clients": aggregate_clients(rows),
        "scatter": build_scatter_data(rows),
        "infractionChart": build_infraction_chart(rows),
        "highDeviationChart": build_high_deviation_chart(rows),
    }
    return json.dumps(body, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/init")
def init():
    """Called on frontend load. Returns dates + latest date data if DB has data, else 204."""
    if not os.path.exists(DB_PATH):
        return Response(status_code=204)
    dates = query_dates()
    if not dates:
        return Response(status_code=204)
    latest = dates[0]
    rows = query_rows(latest)
    body = json.loads(build_response(rows))
    body["dates"] = dates
    body["selectedDate"] = latest
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

    # Find the first sheet+header-row combination that contains the required column
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

    # Normalise % Dif column name (already stripped above, but may differ in case)
    if PCT_DIF_COL not in df.columns:
        match = [c for c in df.columns if c.lower() == PCT_DIF_COL.lower()]
        if match:
            df.rename(columns={match[0]: PCT_DIF_COL}, inplace=True)

    df["score"] = df[PCT_DIF_COL].apply(compute_score)

    # Convert all datetime columns to "YYYY-MM-DD" strings
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")

    # Convert all columns to string so SQLite stores them uniformly
    df = df.astype(str).replace("nan", None)

    # Reset DB with new data
    reset_db(df)

    dates = query_dates()
    latest = dates[0] if dates else None
    rows = query_rows(latest)

    body = json.loads(build_response(rows))
    body["dates"] = dates
    body["selectedDate"] = latest

    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@app.get("/data")
def get_data(date: str = Query(default=None)):
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="No data loaded. Upload a file first.")

    rows = query_rows(date)
    return Response(content=build_response(rows), media_type="application/json")
