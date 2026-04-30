import json
import shutil
import sqlite3
from datetime import datetime

import pandas as pd

from config import CATALOG_PATH, DATASETS_DIR, FECHA_COL, LEGACY_DB_PATH


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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS score_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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


def get_dataset_conn(dataset_id: int) -> sqlite3.Connection:
    db_path = DATASETS_DIR / f"{dataset_id}.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def populate_dataset_db(dataset_id: int, df: pd.DataFrame, sheet_name: str = None) -> None:
    conn = get_dataset_conn(dataset_id)
    try:
        if sheet_name:
            table_name = f"sheet_{sheet_name.replace(' ', '_').replace('-', '_')}"
            conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            col_defs = ", ".join(f'"{c}" TEXT' for c in df.columns)
            conn.execute(f"CREATE TABLE {table_name} ({col_defs})")
            if FECHA_COL in df.columns:
                conn.execute(f'CREATE INDEX IF NOT EXISTS idx_fecha_{sheet_name[:3]} ON {table_name} ("{FECHA_COL}")')
            df.to_sql(table_name, conn, if_exists="append", index=False)
        else:
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


def migrate_legacy_if_needed():
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
