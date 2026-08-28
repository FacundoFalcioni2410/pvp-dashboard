import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

# Local development keeps secrets beside the backend. In Vercel, existing
# environment variables win because python-dotenv does not override them.
load_dotenv(Path(__file__).resolve().with_name(".env"))

from config import FECHA_COL


TURSO_DATABASE_URL = os.getenv(
    "DATABASE_TURSO_DATABASE_URL", os.getenv("TURSO_DATABASE_URL", "")
).strip()
TURSO_AUTH_TOKEN = os.getenv(
    "DATABASE_TURSO_AUTH_TOKEN", os.getenv("TURSO_AUTH_TOKEN", "")
).strip()
# Local dev escape hatch: point at a plain SQLite file instead of round-tripping
# every statement to remote Turso. libSQL is a SQLite superset, so the schema and
# queries here run unchanged. Unset in production -> Turso as before.
LOCAL_DB_PATH = os.getenv("PVP_LOCAL_DB", "").strip()
PRIMARY_SHEET = "__rows__"
INSERT_BATCH_SIZE = 5000


def _connect_local():
    import sqlite3

    path = Path(LOCAL_DB_PATH).expanduser()
    if not path.is_absolute():
        path = Path(__file__).resolve().parent / path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_catalog_conn():
    """DB-API connection to the catalog store: a local SQLite file when
    PVP_LOCAL_DB is set, otherwise the remote Turso database."""
    if LOCAL_DB_PATH:
        return _connect_local()
    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
        raise RuntimeError(
            "Turso is required. Set DATABASE_TURSO_DATABASE_URL and "
            "DATABASE_TURSO_AUTH_TOKEN (or PVP_LOCAL_DB for a local SQLite file)."
        )
    try:
        import turso_serverless
    except ImportError as exc:
        raise RuntimeError("Install the 'turso_serverless' package to use Turso") from exc
    return turso_serverless.connect(TURSO_DATABASE_URL, auth_token=TURSO_AUTH_TOKEN)


def _dict_rows(cursor) -> list[dict]:
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def ensure_catalog():
    conn = get_catalog_conn()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS datasets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                filename TEXT,
                created_at TEXT NOT NULL,
                row_count INTEGER DEFAULT 0,
                sheets TEXT DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS thresholds (
                mla TEXT PRIMARY KEY,
                allowed_pct REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS score_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dataset_rows (
                dataset_id INTEGER NOT NULL,
                sheet_name TEXT NOT NULL,
                row_number INTEGER NOT NULL,
                row_date TEXT,
                row_json TEXT NOT NULL,
                PRIMARY KEY (dataset_id, sheet_name, row_number)
            );

            CREATE INDEX IF NOT EXISTS idx_dataset_rows_date
            ON dataset_rows(dataset_id, sheet_name, row_date);

            CREATE TABLE IF NOT EXISTS catalog_changes (
                row_number INTEGER PRIMARY KEY,
                sheet_name TEXT,
                fecha TEXT,
                cambio TEXT NOT NULL,
                sku TEXT,
                descripcion TEXT,
                datos TEXT,
                reemplaza_a TEXT,
                marca TEXT
            );

            CREATE TABLE IF NOT EXISTS catalog_changes_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        catalog_change_columns = {
            str(row[1]) for row in conn.execute("PRAGMA table_info(catalog_changes)").fetchall()
        }
        if "sheet_name" not in catalog_change_columns:
            conn.execute("ALTER TABLE catalog_changes ADD COLUMN sheet_name TEXT")
        conn.commit()
    finally:
        conn.close()

def list_datasets_from_catalog() -> list[dict]:
    conn = get_catalog_conn()
    try:
        cursor = conn.execute(
            "SELECT id, name, filename, created_at, row_count, sheets "
            "FROM datasets ORDER BY created_at DESC"
        )
        return _dict_rows(cursor)
    finally:
        conn.close()


def create_dataset_in_catalog(
    name: str, filename: str, row_count: int, sheets: list[str] | None = None
) -> int:
    conn = get_catalog_conn()
    try:
        cursor = conn.execute(
            "INSERT INTO datasets (name, filename, created_at, row_count, sheets) "
            "VALUES (?, ?, ?, ?, ?) RETURNING id",
            (
                name,
                filename,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                row_count,
                json.dumps(sheets or []),
            ),
        )
        row = cursor.fetchone()
        if not row:
            raise RuntimeError("Database did not return the new dataset id")
        conn.commit()
        return int(row[0])
    finally:
        conn.close()


def update_dataset_in_catalog(dataset_id: int, row_count: int, sheets: list[str]) -> None:
    conn = get_catalog_conn()
    try:
        conn.execute(
            "UPDATE datasets SET sheets = ?, row_count = ? WHERE id = ?",
            (json.dumps(sheets), row_count, dataset_id),
        )
        conn.commit()
    finally:
        conn.close()


def delete_dataset_from_catalog(dataset_id: int):
    conn = get_catalog_conn()
    try:
        conn.execute("DELETE FROM dataset_rows WHERE dataset_id = ?", (dataset_id,))
        conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()
    finally:
        conn.close()


def get_thresholds() -> dict[str, float]:
    conn = get_catalog_conn()
    try:
        rows = conn.execute("SELECT mla, allowed_pct FROM thresholds").fetchall()
        return {str(row[0]): float(row[1]) for row in rows}
    finally:
        conn.close()


def get_threshold_count() -> int:
    conn = get_catalog_conn()
    try:
        return int(conn.execute("SELECT COUNT(*) FROM thresholds").fetchone()[0])
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
        return int(conn.execute("SELECT COUNT(*) FROM thresholds").fetchone()[0])
    finally:
        conn.close()


def delete_thresholds() -> int:
    conn = get_catalog_conn()
    try:
        conn.execute("DELETE FROM thresholds")
        conn.commit()
        return int(conn.execute("SELECT COUNT(*) FROM thresholds").fetchone()[0])
    finally:
        conn.close()


CATALOG_CHANGE_FIELDS = (
    "sheet_name", "fecha", "cambio", "sku", "descripcion", "datos", "reemplaza_a", "marca"
)


def get_catalog_changes() -> list[dict]:
    conn = get_catalog_conn()
    try:
        cursor = conn.execute(
            "SELECT sheet_name, fecha, cambio, sku, descripcion, datos, reemplaza_a, marca "
            "FROM catalog_changes ORDER BY row_number ASC"
        )
        return _dict_rows(cursor)
    finally:
        conn.close()


def get_catalog_changes_meta() -> dict:
    conn = get_catalog_conn()
    try:
        rows = conn.execute("SELECT key, value FROM catalog_changes_meta").fetchall()
        meta = {str(row[0]): str(row[1]) for row in rows}
        count = int(conn.execute("SELECT COUNT(*) FROM catalog_changes").fetchone()[0])
        meta["count"] = count
        return meta
    finally:
        conn.close()


def replace_catalog_changes(entries: list[dict], meta: dict) -> int:
    """Swap the whole catalog-changes table for a freshly uploaded workbook."""
    values = [
        (
            index,
            str(entry.get("sheet_name") or "") or None,
            str(entry.get("fecha") or "") or None,
            str(entry.get("cambio") or ""),
            str(entry.get("sku") or "") or None,
            str(entry.get("descripcion") or "") or None,
            str(entry.get("datos") or "") or None,
            str(entry.get("reemplaza_a") or "") or None,
            str(entry.get("marca") or "") or None,
        )
        for index, entry in enumerate(entries)
    ]

    # 9 bound params per row; keep each statement well under SQLite's
    # ~32k variable ceiling.
    batch = min(INSERT_BATCH_SIZE, 4000)
    conn = get_catalog_conn()
    try:
        conn.execute("DELETE FROM catalog_changes")
        for offset in range(0, len(values), batch):
            chunk = values[offset:offset + batch]
            placeholders = ", ".join(["(?, ?, ?, ?, ?, ?, ?, ?, ?)"] * len(chunk))
            flat_params = [param for row in chunk for param in row]
            conn.execute(
                "INSERT INTO catalog_changes "
                "(row_number, sheet_name, fecha, cambio, sku, descripcion, datos, reemplaza_a, marca) VALUES "
                + placeholders,
                flat_params,
            )
        conn.execute("DELETE FROM catalog_changes_meta")
        for key in ("filename", "uploaded_at"):
            if meta.get(key):
                conn.execute(
                    "INSERT OR REPLACE INTO catalog_changes_meta (key, value) VALUES (?, ?)",
                    (key, str(meta[key])),
                )
        conn.commit()
        return int(conn.execute("SELECT COUNT(*) FROM catalog_changes").fetchone()[0])
    finally:
        conn.close()


def delete_catalog_changes() -> int:
    conn = get_catalog_conn()
    try:
        conn.execute("DELETE FROM catalog_changes")
        conn.execute("DELETE FROM catalog_changes_meta")
        conn.commit()
        return int(conn.execute("SELECT COUNT(*) FROM catalog_changes").fetchone()[0])
    finally:
        conn.close()


def _serializable_record(record: dict) -> dict:
    clean = {}
    for key, value in record.items():
        if value is None or (not isinstance(value, (str, bytes)) and pd.isna(value)):
            clean[str(key)] = None
        else:
            clean[str(key)] = value if isinstance(value, (str, int, float, bool)) else str(value)
    return clean


def populate_dataset_db(dataset_id: int, df: pd.DataFrame, sheet_name: str | None = None) -> None:
    sheet_key = sheet_name or PRIMARY_SHEET
    records = [_serializable_record(record) for record in df.to_dict(orient="records")]
    values = [
        (
            dataset_id,
            sheet_key,
            index,
            str(record.get(FECHA_COL) or "")[:10] or None,
            json.dumps(record, ensure_ascii=False, separators=(",", ":")),
        )
        for index, record in enumerate(records)
    ]

    conn = get_catalog_conn()
    try:
        conn.execute(
            "DELETE FROM dataset_rows WHERE dataset_id = ? AND sheet_name = ?",
            (dataset_id, sheet_key),
        )
        # executemany() still runs one INSERT statement per row on Turso's
        # side even when pipelined into a single round-trip - for tens of
        # thousands of rows that's tens of thousands of statement
        # executions. A single multi-row VALUES clause per batch cuts that
        # to one statement per batch instead.
        for offset in range(0, len(values), INSERT_BATCH_SIZE):
            chunk = values[offset:offset + INSERT_BATCH_SIZE]
            placeholders = ", ".join(["(?, ?, ?, ?, ?)"] * len(chunk))
            flat_params = [param for row in chunk for param in row]
            conn.execute(
                "INSERT INTO dataset_rows "
                "(dataset_id, sheet_name, row_number, row_date, row_json) VALUES " + placeholders,
                flat_params,
            )
        conn.commit()
    finally:
        conn.close()


def query_dataset_rows(dataset_id: int, date: str | None) -> list[dict]:
    conn = get_catalog_conn()
    try:
        if date:
            rows = conn.execute(
                "SELECT row_json FROM dataset_rows "
                "WHERE dataset_id = ? AND sheet_name = ? AND row_date = ? ORDER BY row_number",
                (dataset_id, PRIMARY_SHEET, date),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT row_json FROM dataset_rows "
                "WHERE dataset_id = ? AND sheet_name = ? ORDER BY row_number",
                (dataset_id, PRIMARY_SHEET),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]
    finally:
        conn.close()


def query_dataset_dates(dataset_id: int) -> list[str]:
    conn = get_catalog_conn()
    try:
        rows = conn.execute(
            "SELECT DISTINCT row_date FROM dataset_rows "
            "WHERE dataset_id = ? AND sheet_name = ? AND row_date IS NOT NULL "
            "ORDER BY row_date DESC",
            (dataset_id, PRIMARY_SHEET),
        ).fetchall()
        return [str(row[0]) for row in rows if row[0]]
    finally:
        conn.close()
