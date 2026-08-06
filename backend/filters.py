import json

from config import CANAL_COL, MACRO_FAMILIA_COL, RAZON_SOCIAL_COL, ROT_COL, SKU_COL, TIPO_CLIENTE_COL
from database import get_threshold_count
from scoring import enrich_rows
from charts import (
    aggregate_clients,
    build_deviation_chart,
    build_monthly_deviation_chart,
    build_monthly_summary,
    build_rot_chart,
    build_scatter_data,
    build_sku_deviation_chart,
    build_sku_score_chart,
)

EMPTY_TIPO_VALUES = {"", "-", "N/A", "NA", "0"}


def _normalise_tipo(raw) -> str:
    return (raw or "").strip().upper()


def apply_global_filters(rows, tipoCliente=None, canal=None, macrofamilia=None, rot=None):
    selected_tipos = {t.upper() for t in tipoCliente} if tipoCliente else set()

    def matches(row):
        if selected_tipos:
            if _normalise_tipo(row.get(TIPO_CLIENTE_COL)) not in selected_tipos:
                return False
        if canal and len(canal) > 0:
            row_canal = (row.get(CANAL_COL) or "").strip().upper()
            if row_canal not in [c.upper() for c in canal]:
                return False
        if macrofamilia and len(macrofamilia) > 0:
            row_macro = (row.get(MACRO_FAMILIA_COL) or "").strip().upper()
            if row_macro not in [m.upper() for m in macrofamilia]:
                return False
        if rot and len(rot) > 0:
            row_rot = (row.get(ROT_COL) or "").strip().upper()
            if row_rot not in [r.upper() for r in rot]:
                return False
        return True
    return [r for r in rows if matches(r)]


def filter_by_sku(rows, skus):
    if not skus:
        return rows
    selected = {s.strip().upper() for s in skus if s.strip()}
    if not selected:
        return rows
    return [r for r in rows if (str(r.get(SKU_COL) or "")).strip().upper() in selected]


def build_filter_options(rows) -> dict:
    canales = sorted({(r.get(CANAL_COL) or "").strip() for r in rows if (r.get(CANAL_COL) or "").strip() and not (r.get(CANAL_COL) or "").strip().lstrip("-").isdigit()})
    macrofamilias = sorted({(r.get(MACRO_FAMILIA_COL) or "").strip() for r in rows if (r.get(MACRO_FAMILIA_COL) or "").strip()})
    rots = sorted({(r.get(ROT_COL) or "").strip().upper() for r in rows if (r.get(ROT_COL) or "").strip()})
    tipos = sorted({
        _normalise_tipo(r.get(TIPO_CLIENTE_COL))
        for r in rows
        if _normalise_tipo(r.get(TIPO_CLIENTE_COL)) not in EMPTY_TIPO_VALUES
    })
    return {"tipoCliente": tipos, "canales": canales, "macrofamilias": macrofamilias, "rots": rots}


def build_response(rows: list[dict], all_rows: list[dict] | None = None, rot_rows: list[dict] | None = None) -> str:
    rows = enrich_rows(rows)
    chart_rows = enrich_rows(all_rows) if all_rows is not None else rows
    rot_chart_rows = enrich_rows(rot_rows) if rot_rows is not None else rows
    body = {
        "rows": rows,
        "total": len(rows),
        "clients": aggregate_clients(rows),
        "allDatesClients": aggregate_clients(chart_rows),
        "scatter": build_scatter_data(rows),
        "deviationChart": build_deviation_chart(rows),
        "allDatesDeviationChart": build_deviation_chart(chart_rows),
        "monthlyDeviationChart": build_monthly_deviation_chart(chart_rows),
        "monthlySummary": build_monthly_summary(chart_rows),
        "skuScoreChart": build_sku_score_chart(rows),
        "allDatesSkuScoreChart": build_sku_score_chart(chart_rows),
        "skuDeviationChart": build_sku_deviation_chart(rows),
        "rotChart": build_rot_chart(rot_chart_rows),
        "thresholdCount": get_threshold_count(),
    }
    return json.dumps(body, ensure_ascii=False)
