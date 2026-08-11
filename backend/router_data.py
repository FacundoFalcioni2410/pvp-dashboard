import io
import json
import logging
import time
from collections import defaultdict

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from config import PCT_DIF_COL, RAZON_SOCIAL_COL, SKU_COL
from database import (
    create_dataset_in_catalog,
    get_catalog_conn,
    get_dataset_conn,
    list_datasets_from_catalog,
    populate_dataset_db,
    query_dataset_dates,
    query_dataset_rows,
)
from filters import apply_global_filters, build_filter_options, build_response, filter_by_sku
from scoring import compute_score, enrich_rows

logger = logging.getLogger("upload_timing")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s", "%H:%M:%S"))
    logger.addHandler(_handler)
    logger.propagate = False

router = APIRouter()


@router.get("/init")
def init():
    datasets = list_datasets_from_catalog()
    if not datasets:
        return Response(status_code=204)
    dataset_id = datasets[0]["id"]
    dates = query_dataset_dates(dataset_id)
    if not dates:
        return Response(status_code=204)
    rows = query_dataset_rows(dataset_id, dates[0])
    all_rows = query_dataset_rows(dataset_id, None)
    body = json.loads(build_response(rows, all_rows))
    body["filterOptions"] = build_filter_options(rows)
    body["dates"] = dates
    body["selectedDate"] = dates[0]
    body["datasets"] = datasets
    body["activeDatasetId"] = dataset_id
    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@router.get("/data")
def get_data(
    date: str = Query(default=None),
    dataset_id: int = Query(default=None),
    all_dates: bool = Query(default=False),
    tipoCliente: str = Query(default=None),
    canal: str = Query(default=None),
    macrofamilia: str = Query(default=None),
    marca: str = Query(default=None),
    rot: str = Query(default=None),
    sku: str = Query(default=None),
):
    datasets = list_datasets_from_catalog()
    if not datasets:
        raise HTTPException(status_code=404, detail="No data loaded. Upload a file first.")
    if dataset_id is None:
        dataset_id = datasets[0]["id"]
    elif not any(d["id"] == dataset_id for d in datasets):
        raise HTTPException(status_code=404, detail="Dataset not found")

    dates = query_dataset_dates(dataset_id)
    resolved_date = None if all_dates else (date or (dates[0] if dates else None))
    raw_rows = query_dataset_rows(dataset_id, resolved_date)
    raw_all_rows = raw_rows if all_dates or resolved_date is None else query_dataset_rows(dataset_id, None)

    sku_list = [s.strip() for s in sku.split(",") if s.strip()] if sku else []
    if sku_list:
        raw_rows = filter_by_sku(raw_rows, sku_list)
        raw_all_rows = filter_by_sku(raw_all_rows, sku_list)

    filter_options = build_filter_options(raw_rows)

    tipo_cliente_list = [t.strip() for t in tipoCliente.split(",") if t.strip()] if tipoCliente else []
    canal_list = [c.strip() for c in canal.split(",") if c.strip()] if canal else []
    macrofamilia_list = [m.strip() for m in macrofamilia.split(",") if m.strip()] if macrofamilia else []
    marca_list = [m.strip() for m in marca.split(",") if m.strip()] if marca else []
    rot_list = [r.strip() for r in rot.split(",") if r.strip()] if rot else []

    # Selecting every available option is semantically identical to no filter; clear the list
    # so rows with no value for that field are not incorrectly excluded.
    if tipo_cliente_list and {t.upper() for t in tipo_cliente_list} >= {t.upper() for t in filter_options.get("tipoCliente", [])}:
        tipo_cliente_list = []
    if canal_list and {c.upper() for c in canal_list} >= {c.upper() for c in filter_options.get("canales", [])}:
        canal_list = []
    if macrofamilia_list and {m.upper() for m in macrofamilia_list} >= {m.upper() for m in filter_options.get("macrofamilias", [])}:
        macrofamilia_list = []
    if marca_list and {m.upper() for m in marca_list} >= {m.upper() for m in filter_options.get("marcas", [])}:
        marca_list = []
    if rot_list and {r.upper() for r in rot_list} >= {r.upper() for r in filter_options.get("rots", [])}:
        rot_list = []

    rows_no_rot = apply_global_filters(raw_rows, tipoCliente=tipo_cliente_list, canal=canal_list, macrofamilia=macrofamilia_list, marca=marca_list)
    rows_filtered = apply_global_filters(rows_no_rot, rot=rot_list) if rot_list else rows_no_rot
    all_no_rot = apply_global_filters(raw_all_rows, tipoCliente=tipo_cliente_list, canal=canal_list, macrofamilia=macrofamilia_list, marca=marca_list)
    all_filtered = apply_global_filters(all_no_rot, rot=rot_list) if rot_list else all_no_rot

    body = json.loads(build_response(rows_filtered, all_filtered, rot_rows=rows_no_rot))
    body["filterOptions"] = filter_options
    body["dates"] = dates
    body["selectedDate"] = resolved_date
    body["activeDatasetId"] = dataset_id
    body["sheets"] = json.loads(datasets[0].get("sheets", "[]"))
    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@router.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    t_start = time.perf_counter()
    logger.info("upload start: %s", file.filename)

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are accepted")

    contents = await file.read()
    try:
        # calamine (Rust) reads raw cell data directly and stays fast even on sheets
        # with a bloated used-range (old formatting on empty cells past the real data),
        # where openpyxl crawls cell-by-cell regardless of read_only mode.
        xl = pd.ExcelFile(io.BytesIO(contents), engine="calamine")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse Excel file: {e}")

    t_parsed = time.perf_counter()
    logger.info("upload [%s]: excel parsed in %.2fs", file.filename, t_parsed - t_start)

    def _has_pct_col(columns):
        cols_lower = [str(c).strip().lower() for c in columns]
        return PCT_DIF_COL.lower() in cols_lower or any(PCT_DIF_COL.lower() in c for c in cols_lower)

    base_name = file.filename.rsplit(".", 1)[0] if "." in file.filename else file.filename
    dataset_id = create_dataset_in_catalog(base_name, file.filename, 0)

    logger.info("upload [%s]: scanning %d sheet(s): %s", file.filename, len(xl.sheet_names), xl.sheet_names)

    valid_sheets = []
    total_rows = 0
    first_sheet_df = None

    for sheet in xl.sheet_names:
        t_sheet = time.perf_counter()
        matched = False
        for header_row in (0, 1):
            try:
                # Cheap probe: read only the header row to check for the target column
                # before paying for a full-sheet parse of an irrelevant sheet.
                probe = xl.parse(sheet, header=header_row, nrows=0)
                probe.columns = [str(c).strip() for c in probe.columns]
                if not _has_pct_col(probe.columns):
                    continue

                sheet_df = xl.parse(sheet, header=header_row)
                sheet_df.columns = [str(c).strip() for c in sheet_df.columns]
                if PCT_DIF_COL not in sheet_df.columns:
                    match = [c for c in sheet_df.columns if c.lower() == PCT_DIF_COL.lower()]
                    if match:
                        sheet_df.rename(columns={match[0]: PCT_DIF_COL}, inplace=True)
                sheet_df["score"] = sheet_df[PCT_DIF_COL].apply(compute_score)
                for col in sheet_df.select_dtypes(include=["datetime", "datetimetz"]).columns:
                    sheet_df[col] = sheet_df[col].dt.strftime("%Y-%m-%d")
                sheet_df = sheet_df.astype(str).replace("nan", None)
                if first_sheet_df is None:
                    first_sheet_df = sheet_df
                populate_dataset_db(dataset_id, sheet_df, sheet)
                valid_sheets.append(sheet)
                total_rows += len(sheet_df)
                matched = True
                break
            except Exception:
                continue
        logger.info(
            "upload [%s]: sheet '%s' %s in %.2fs",
            file.filename, sheet, "matched" if matched else "skipped", time.perf_counter() - t_sheet,
        )

    if not valid_sheets:
        raise HTTPException(
            status_code=422,
            detail=f"No sheet found containing column '{PCT_DIF_COL}'. Sheets: {xl.sheet_names}",
        )

    t_sheets_populated = time.perf_counter()
    logger.info(
        "upload [%s]: %d sheets / %d rows parsed+populated in %.2fs",
        file.filename, len(valid_sheets), total_rows, t_sheets_populated - t_parsed,
    )

    conn = get_catalog_conn()
    try:
        conn.execute(
            "UPDATE datasets SET sheets = ?, row_count = ? WHERE id = ?",
            (json.dumps(valid_sheets), total_rows, dataset_id),
        )
        conn.commit()
    finally:
        conn.close()

    if first_sheet_df is not None:
        populate_dataset_db(dataset_id, first_sheet_df, None)

    t_first_sheet_populated = time.perf_counter()
    logger.info(
        "upload [%s]: undated rows populated in %.2fs",
        file.filename, t_first_sheet_populated - t_sheets_populated,
    )

    datasets = list_datasets_from_catalog()
    dates = query_dataset_dates(dataset_id)
    latest_date = dates[0] if dates else None
    rows = query_dataset_rows(dataset_id, latest_date)
    all_rows = query_dataset_rows(dataset_id, None)

    t_queried = time.perf_counter()
    logger.info(
        "upload [%s]: rows queried (%d latest / %d all) in %.2fs",
        file.filename, len(rows), len(all_rows), t_queried - t_first_sheet_populated,
    )

    body = json.loads(build_response(rows, all_rows))
    body["filterOptions"] = build_filter_options(rows)
    body["dates"] = dates
    body["selectedDate"] = latest_date
    body["datasets"] = datasets
    body["activeDatasetId"] = dataset_id
    body["sheets"] = valid_sheets

    t_end = time.perf_counter()
    logger.info(
        "upload [%s]: charts built in %.2fs — total %.2fs",
        file.filename, t_end - t_queried, t_end - t_start,
    )

    return Response(content=json.dumps(body, ensure_ascii=False), media_type="application/json")


@router.get("/compare")
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

    def avg_pct_by_group(rows, group_col, filter_col, filter_val):
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
        return {k: (round(sum(v) / len(v)), len(v)) for k, v in groups.items() if v}

    rows1 = get_all_rows(dataset1_id)
    rows2 = get_all_rows(dataset2_id)

    group_col, filter_col, filter_val = (
        (SKU_COL, RAZON_SOCIAL_COL, client) if client else (RAZON_SOCIAL_COL, SKU_COL, sku)
    )

    map1 = avg_pct_by_group(rows1, group_col, filter_col, filter_val)
    map2 = avg_pct_by_group(rows2, group_col, filter_col, filter_val)

    all_keys = set(map1.keys()) | set(map2.keys())
    items = []
    for key in all_keys:
        e1, e2 = map1.get(key), map2.get(key)
        avg1 = e1[0] if e1 else None
        avg2 = e2[0] if e2 else None
        items.append({
            "key": key,
            "avg1": avg1,
            "count1": e1[1] if e1 else 0,
            "avg2": avg2,
            "count2": e2[1] if e2 else 0,
            "delta": round(avg1 - avg2) if avg1 is not None and avg2 is not None else None,
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
