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
PRIMARY_SHEET = "__rows__"
INSERT_BATCH_SIZE = 2000


def get_catalog_conn():
    """Return the remote Turso DB-API connection used in every environment."""
    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
        raise RuntimeError(
            "Turso is required. Set DATABASE_TURSO_DATABASE_URL and "
            "DATABASE_TURSO_AUTH_TOKEN."
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
        """)
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
        for offset in range(0, len(values), INSERT_BATCH_SIZE):
            conn.executemany(
                "INSERT INTO dataset_rows "
                "(dataset_id, sheet_name, row_number, row_date, row_json) VALUES (?, ?, ?, ?, ?)",
                values[offset:offset + INSERT_BATCH_SIZE],
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
