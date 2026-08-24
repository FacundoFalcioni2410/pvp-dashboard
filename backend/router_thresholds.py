import io
import math
import zipfile
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from database import delete_thresholds, upsert_thresholds
from config import MAX_EXCEL_COLUMNS, MAX_EXCEL_ROWS, MAX_EXCEL_SHEETS, MAX_EXCEL_UNCOMPRESSED_BYTES, MAX_UPLOAD_BYTES
from security import CsrfUser, get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/upload-thresholds")
async def upload_thresholds(user: CsrfUser, file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are accepted")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than the configured upload limit")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if suffix == ".xlsx":
        try:
            with zipfile.ZipFile(io.BytesIO(contents)) as archive:
                entries = archive.infolist()
                if len(entries) > 2_000 or sum(item.file_size for item in entries) > MAX_EXCEL_UNCOMPRESSED_BYTES:
                    raise HTTPException(status_code=413, detail="Expanded workbook is too large")
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=422, detail="Invalid Excel workbook") from exc
    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Could not parse Excel file") from exc
    if len(xl.sheet_names) > MAX_EXCEL_SHEETS:
        raise HTTPException(status_code=413, detail="Workbook contains too many sheets")

    def is_mla_col(c: str) -> bool:
        c = c.lower()
        return "mla" in c or "sku" in c or "código" in c or "codigo" in c

    def is_pct_col(c: str) -> bool:
        c = c.strip().upper()
        return c == "% PERMITIDO" or "TOLERANCIA" in c

    dfs = []
    for sheet in xl.sheet_names:
        for header_row in range(10):
            candidate = xl.parse(sheet, header=header_row)
            if len(candidate) > MAX_EXCEL_ROWS or len(candidate.columns) > MAX_EXCEL_COLUMNS:
                raise HTTPException(status_code=413, detail="Worksheet exceeds configured dimensions")
            candidate.columns = [str(c).strip() for c in candidate.columns]
            cols = list(candidate.columns)
            mla_col = next((c for c in cols if is_mla_col(c)), None)
            pct_col = next((c for c in cols if is_pct_col(c) and c != mla_col), None)
            if mla_col and pct_col:
                dfs.append((candidate, mla_col, pct_col))
                break

    if not dfs:
        raise HTTPException(
            status_code=422,
            detail="No sheet found with a SKU/Código column and a Porcentaje de Tolerancia column.",
        )

    entries = []
    for df, mla_col, pct_col in dfs:
        for _, row in df.iterrows():
            mla = str(row[mla_col]).strip()
            try:
                pct = float(row[pct_col])
            except (ValueError, TypeError):
                continue
            if not mla or mla.lower() == "nan":
                continue
            if len(mla) > 200 or not math.isfinite(pct):
                continue
            if abs(pct) <= 1.5:
                pct = pct * 100
            if abs(pct) > 10_000:
                continue
            entries.append((mla, abs(pct)))

    if not entries:
        raise HTTPException(status_code=422, detail="No valid MLA/threshold rows found.")

    total = upsert_thresholds(entries)
    return {"loaded": len(entries), "total": total}


@router.delete("/upload-thresholds")
def clear_thresholds(user: CsrfUser):
    total = delete_thresholds()
    return {"total": total}
