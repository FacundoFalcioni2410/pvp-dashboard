import io

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from database import upsert_thresholds

router = APIRouter()


@router.post("/upload-thresholds")
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

    mla_col = next((c for c in df.columns if "mla" in c.lower() or "sku" in c.lower()), None)
    pct_col = next(
        (c for c in df.columns if c.strip().upper() == "% PERMITIDO" and c != mla_col),
        None,
    )

    if not mla_col or not pct_col:
        raise HTTPException(
            status_code=422,
            detail=f"Could not identify SKU/MLA and threshold columns. Found columns: {list(df.columns)}",
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
        if abs(pct) <= 1.5:
            pct = pct * 100
        entries.append((mla, abs(pct)))

    if not entries:
        raise HTTPException(status_code=422, detail="No valid MLA/threshold rows found.")

    total = upsert_thresholds(entries)
    return {"loaded": len(entries), "total": total}
