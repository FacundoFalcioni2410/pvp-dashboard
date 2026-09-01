import io
import logging
import os
import re
import time
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

logger = logging.getLogger("upload_timing")

from config import (
    MAX_EXCEL_COLUMNS,
    MAX_EXCEL_ROWS,
    MAX_EXCEL_SHEETS,
    MAX_EXCEL_UNCOMPRESSED_BYTES,
    MAX_BLOB_DOWNLOAD_BYTES,
    MAX_UPLOAD_BYTES,
)
from database import delete_catalog_changes, get_catalog_changes, get_catalog_changes_meta, replace_catalog_changes
from security import CsrfUser, get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

# Upper bound on characters kept per field so a pathological cell cannot bloat a row.
_FIELD_LIMITS = {
    "sheet_name": 100,
    "fecha": 32,
    "cambio": 120,
    "sku": 200,
    "descripcion": 1000,
    "datos": 8000,
    "reemplaza_a": 200,
    "marca": 120,
}


def _norm(text: str) -> str:
    """Lowercase, strip accents/punctuation so 'Descripción' == 'descripcion'."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _clean(value) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _match_columns(columns: list[str]) -> dict | None:
    """Map the workbook's columns onto our logical fields, or return None if the
    sheet clearly isn't the changes log (no 'Cambio' + no SKU/Descripción)."""
    norm = {col: _norm(col) for col in columns}
    mapping: dict[str, str] = {}

    for col, key in norm.items():
        if "reemplaza" in key and "reemplaza_a" not in mapping:
            mapping["reemplaza_a"] = col
    for col, key in norm.items():
        if col in mapping.values():
            continue
        if "fecha" in key and "fecha" not in mapping:
            mapping["fecha"] = col
        elif "cambio" in key and "cambio" not in mapping:
            mapping["cambio"] = col
        elif "descripcion" in key and "descripcion" not in mapping:
            mapping["descripcion"] = col
        elif ("datostecnicos" in key or key == "datos") and "datos" not in mapping:
            mapping["datos"] = col
        elif "marca" in key and "marca" not in mapping:
            mapping["marca"] = col
        elif (key == "sku" or "codigo" in key) and "sku" not in mapping:
            mapping["sku"] = col

    if "cambio" not in mapping or ("sku" not in mapping and "descripcion" not in mapping):
        return None
    return mapping


def _parse_fecha(value) -> str:
    if value is None or _clean(value) == "":
        return ""
    if hasattr(value, "strftime"):
        try:
            return value.strftime("%Y-%m-%d")
        except ValueError:
            return ""
    parsed = pd.to_datetime(_clean(value), errors="coerce", dayfirst=False)
    if pd.isna(parsed):
        return ""
    return parsed.strftime("%Y-%m-%d")


def _open_workbook(contents: bytes):
    # calamine (Rust) reads raw cells directly and stays fast even when a sheet
    # has a bloated used-range; openpyxl crawls it cell-by-cell and can take
    # minutes. Prefer calamine, fall back to whatever pandas has.
    for kwargs in ({"engine": "calamine"}, {}):
        try:
            return pd.ExcelFile(io.BytesIO(contents), **kwargs)
        except ImportError:
            continue
        except Exception as exc:  # noqa: BLE001 - retried / re-raised below
            last = exc
    raise HTTPException(status_code=422, detail="Could not parse Excel file") from last


def parse_catalog_changes(contents: bytes) -> list[dict]:
    """Pure Excel -> normalized rows. Raises HTTPException on unusable input."""
    t0 = time.perf_counter()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    try:
        with zipfile.ZipFile(io.BytesIO(contents)) as archive:
            entries = archive.infolist()
            if len(entries) > 2_000 or sum(item.file_size for item in entries) > MAX_EXCEL_UNCOMPRESSED_BYTES:
                raise HTTPException(status_code=413, detail="Expanded workbook is too large")
    except zipfile.BadZipFile:
        pass  # .xls (or something pandas may still handle) — let the parser decide

    xl = _open_workbook(contents)
    if len(xl.sheet_names) > MAX_EXCEL_SHEETS:
        raise HTTPException(status_code=413, detail="Workbook contains too many sheets")
    logger.info("catalog upload: workbook opened in %.2fs (%d sheets)", time.perf_counter() - t0, len(xl.sheet_names))

    rows: list[dict] = []
    for sheet in xl.sheet_names:
        try:
            mapping = None
            header_row = None
            # Cheap probe: read only the header row (no data) to locate the
            # header and confirm this sheet is the changes log, so the full
            # parse below happens exactly once instead of up to 10 times.
            for candidate_row in range(10):
                probe = xl.parse(sheet, header=candidate_row, nrows=0)
                probe.columns = [str(c).strip() for c in probe.columns]
                if len(probe.columns) > MAX_EXCEL_COLUMNS:
                    raise HTTPException(status_code=413, detail="Worksheet has too many columns")
                found = _match_columns(list(probe.columns))
                if found:
                    mapping, header_row = found, candidate_row
                    break
            if mapping is None:
                continue

            t_sheet = time.perf_counter()
            frame = xl.parse(sheet, header=header_row)
            if len(frame) > MAX_EXCEL_ROWS:
                raise HTTPException(status_code=413, detail="Worksheet has too many rows")
            frame.columns = [str(c).strip() for c in frame.columns]
            mapping = _match_columns(list(frame.columns)) or mapping
            logger.info(
                "catalog upload: sheet '%s' parsed (%d rows) in %.2fs",
                sheet, len(frame), time.perf_counter() - t_sheet,
            )

            for _, raw in frame.iterrows():
                cambio = _clean(raw[mapping["cambio"]])
                sku = _clean(raw[mapping["sku"]]) if "sku" in mapping else ""
                descripcion = _clean(raw[mapping["descripcion"]]) if "descripcion" in mapping else ""
                if not cambio and not sku and not descripcion:
                    continue
                if not cambio:
                    continue
                entry = {
                    "sheet_name": str(sheet).strip(),
                    "fecha": _parse_fecha(raw[mapping["fecha"]]) if "fecha" in mapping else "",
                    "cambio": cambio,
                    "sku": sku,
                    "descripcion": descripcion,
                    "datos": _clean(raw[mapping["datos"]]) if "datos" in mapping else "",
                    "reemplaza_a": _clean(raw[mapping["reemplaza_a"]]) if "reemplaza_a" in mapping else "",
                    "marca": _clean(raw[mapping["marca"]]) if "marca" in mapping else "",
                }
                rows.append({k: v[: _FIELD_LIMITS[k]] for k, v in entry.items()})
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001 - a single unreadable sheet is skipped
            continue

    if not rows:
        raise HTTPException(
            status_code=422,
            detail="No sheet found with a 'Cambio' column plus a SKU or Descripción column.",
        )
    logger.info("catalog upload: %d rows parsed in %.2fs total", len(rows), time.perf_counter() - t0)
    return rows


@router.get("/catalog-changes")
def read_catalog_changes():
    return {"changes": get_catalog_changes(), "meta": get_catalog_changes_meta()}


@router.post("/upload-catalog-changes")
async def upload_catalog_changes(user: CsrfUser, file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are accepted")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than the configured upload limit")

    entries = parse_catalog_changes(contents)
    meta = {
        "filename": re.sub(r"[^\w. -]", "_", Path(file.filename or "").name, flags=re.UNICODE)[:150],
        "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    replace_catalog_changes(entries, meta)
    return {"loaded": len(entries), "meta": get_catalog_changes_meta()}


class CatalogBlobUploadRequest(BaseModel):
    blob_url: str = Field(min_length=1, max_length=2048)
    filename: str = Field(min_length=1, max_length=200)


def _delete_catalog_blob(blob_url: str) -> None:
    token = os.getenv("BLOB_READ_WRITE_TOKEN", "")
    if not token:
        return
    try:
        httpx.post(
            "https://blob.vercel-storage.com/delete",
            json={"urls": [blob_url]},
            headers={"authorization": f"Bearer {token}", "x-api-version": "10"},
            timeout=10,
        )
    except httpx.HTTPError:
        logger.warning("Failed to delete catalog blob %s after ingestion", blob_url)


@router.post("/upload-catalog-changes-from-blob")
async def upload_catalog_changes_from_blob(payload: CatalogBlobUploadRequest, user: CsrfUser):
    """Ingest catalog changes uploaded directly from the browser to Vercel Blob."""
    safe_filename = Path(payload.filename).name
    safe_filename = re.sub(r"[^\w. -]", "_", safe_filename, flags=re.UNICODE)[:150]
    if Path(safe_filename).suffix.lower() not in {".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are accepted")
    if not re.match(r"^https://[a-z0-9]+\.private\.blob\.vercel-storage\.com/", payload.blob_url):
        raise HTTPException(status_code=400, detail="Invalid blob URL")

    token = os.getenv("BLOB_READ_WRITE_TOKEN", "")
    try:
        with httpx.stream(
            "GET",
            payload.blob_url,
            timeout=60,
            headers={"authorization": f"Bearer {token}"} if token else {},
        ) as response:
            response.raise_for_status()
            chunks = []
            total = 0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > MAX_BLOB_DOWNLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="File is larger than the configured blob upload limit",
                    )
                chunks.append(chunk)
            contents = b"".join(chunks)
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not download uploaded file") from exc

    try:
        entries = parse_catalog_changes(contents)
        meta = {
            "filename": safe_filename,
            "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        replace_catalog_changes(entries, meta)
    finally:
        _delete_catalog_blob(payload.blob_url)

    return {"loaded": len(entries), "meta": get_catalog_changes_meta()}


@router.delete("/upload-catalog-changes")
def clear_catalog_changes(user: CsrfUser):
    delete_catalog_changes()
    return {"meta": get_catalog_changes_meta()}
