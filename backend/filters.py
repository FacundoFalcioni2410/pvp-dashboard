import json

from config import CANAL_COL, MACRO_FAMILIA_COL, RAZON_SOCIAL_COL, ROT_COL, TIPO_CLIENTE_COL
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


def apply_global_filters(rows, tipoCliente=None, canal=None, macrofamilia=None, rot=None):
    def matches(row):
        if tipoCliente and len(tipoCliente) > 0:
            row_tipo = (row.get(TIPO_CLIENTE_COL) or "").strip().upper()
            if row_tipo not in [t.upper() for t in tipoCliente]:
                return False
        if canal and (row.get(CANAL_COL) or "").strip().upper() != canal.upper():
            return False
        if macrofamilia and (row.get(MACRO_FAMILIA_COL) or "").strip().upper() != macrofamilia.upper():
            return False
        if rot and (row.get(ROT_COL) or "").strip().upper() != rot.upper():
            return False
        return True
    return [r for r in rows if matches(r)]


def build_filter_options(rows) -> dict:
    canales = sorted({(r.get(CANAL_COL) or "").strip() for r in rows if (r.get(CANAL_COL) or "").strip()})
    macrofamilias = sorted({(r.get(MACRO_FAMILIA_COL) or "").strip() for r in rows if (r.get(MACRO_FAMILIA_COL) or "").strip()})
    rots = sorted({(r.get(ROT_COL) or "").strip().upper() for r in rows if (r.get(ROT_COL) or "").strip()})
    tipoCliente = sorted({(r.get(TIPO_CLIENTE_COL) or "").strip() for r in rows if (r.get(TIPO_CLIENTE_COL) or "").strip()})
    return {"tipoCliente": tipoCliente, "canales": canales, "macrofamilias": macrofamilias, "rots": rots}


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
