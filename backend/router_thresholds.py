import io

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from database import delete_thresholds, upsert_thresholds

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
            if abs(pct) <= 1.5:
                pct = pct * 100
            entries.append((mla, abs(pct)))

    if not entries:
        raise HTTPException(status_code=422, detail="No valid MLA/threshold rows found.")

    total = upsert_thresholds(entries)
    return {"loaded": len(entries), "total": total}


@router.delete("/upload-thresholds")
def clear_thresholds():
    total = delete_thresholds()
    return {"total": total}
