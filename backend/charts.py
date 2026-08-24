import math
import random
from collections import defaultdict

from config import (
    CANAL_COL, FECHA_COL, MACRO_FAMILIA_COL, MLA_COL,
    PCT_DIF_COL, RAZON_SOCIAL_COL, ROT_COL, SKU_COL,
    TIPO_CLIENTE_COL, USUARIO_ML_COL,
)
from scoring import get_score_config, normalise_pct

ROT_ORDER = ["A", "B", "C", "D", "S", "U"]


def _top_score() -> int:
    """The highest attainable score (fully compliant), matching scoring.compute_score."""
    return len(get_score_config()) + 2


def _deduplicate_by_mla_day(rows: list[dict]) -> list[dict]:
    best: dict[tuple, dict] = {}
    for row in rows:
        razon = row.get(RAZON_SOCIAL_COL) or "Sin nombre"
        mla = row.get(MLA_COL) or ""
        fecha = str(row.get(FECHA_COL) or "")[:10]
        key = (razon, mla, fecha)
        abs_pct = abs(normalise_pct(row.get(PCT_DIF_COL)) or 0)
        if key not in best or abs_pct > abs(normalise_pct(best[key].get(PCT_DIF_COL)) or 0):
            best[key] = row
    return list(best.values())


def _deduplicate_by_sku_day(rows: list[dict]) -> list[dict]:
    best: dict[tuple, dict] = {}
    for row in rows:
        razon = row.get(RAZON_SOCIAL_COL) or "Sin nombre"
        sku = (row.get(SKU_COL) or row.get(MLA_COL) or "").strip()
        fecha = str(row.get(FECHA_COL) or "")[:10]
        key = (razon, sku, fecha)
        abs_pct = abs(normalise_pct(row.get(PCT_DIF_COL)) or 0)
        if key not in best or abs_pct > abs(normalise_pct(best[key].get(PCT_DIF_COL)) or 0):
            best[key] = row
    return list(best.values())


def _deduplicate_by_mla(rows: list[dict]) -> list[dict]:
    best: dict[tuple, dict] = {}
    for row in rows:
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        mla = (row.get(MLA_COL) or "").strip()
        key = (razon, mla)
        abs_pct = abs(normalise_pct(row.get(PCT_DIF_COL)) or 0)
        if key not in best or abs_pct > abs(normalise_pct(best[key].get(PCT_DIF_COL)) or 0):
            best[key] = row
    return list(best.values())


def aggregate_clients(rows: list[dict]) -> list:
    client_map = defaultdict(lambda: {"scores": [], "usuario": "", "tipo": ""})
    for row in rows:
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        usuario = (row.get(USUARIO_ML_COL) or "").strip()
        tipo = (row.get(TIPO_CLIENTE_COL) or "").strip()
        score = row.get("score")
        try:
            score = int(score)
        except (TypeError, ValueError):
            score = 0
        if score > 0:
            client_map[razon]["scores"].append(score)
            if usuario:
                client_map[razon]["usuario"] = usuario
            if tipo and not client_map[razon]["tipo"]:
                client_map[razon]["tipo"] = tipo
    result = []
    for name, data in client_map.items():
        scores = data["scores"]
        result.append({
            "name": name,
            "scores": scores,
            "avgScore": round(sum(scores) / len(scores)) if scores else 0,
            "usuario": data["usuario"],
            "tipo": data["tipo"],
        })
    return result


def build_sku_score_chart(rows: list[dict]) -> list:
    sku_map = defaultdict(lambda: {"scores": [], "descripcion": ""})
    for row in rows:
        sku = (row.get(SKU_COL) or row.get(MLA_COL) or "Sin SKU").strip()
        score = row.get("score")
        try:
            score = int(score)
        except (TypeError, ValueError):
            score = 0
        if score > 0:
            sku_map[sku]["scores"].append(score)
            if not sku_map[sku]["descripcion"]:
                sku_map[sku]["descripcion"] = (row.get("DESCRIPCION") or "").strip()
    result = []
    for sku, data in sku_map.items():
        scores = data["scores"]
        if scores:
            result.append({
                "sku": sku,
                "name": sku,
                "descripcion": data["descripcion"],
                "avgScore": round(sum(scores) / len(scores)),
            })
    result.sort(key=lambda x: x["avgScore"])
    return result[:50]


def build_scatter_data(rows: list[dict], max_points: int = 500) -> list:
    scatter = []
    for row in rows:
        pct = normalise_pct(row.get(PCT_DIF_COL))
        score = row.get("score")
        if pct is not None and score is not None:
            scatter.append({
                "pct": round(abs(pct)),
                "score": int(score),
                "client": (row.get(RAZON_SOCIAL_COL) or "—").strip(),
            })
    if len(scatter) > max_points:
        scatter = random.sample(scatter, max_points)
    return scatter


def build_infraction_chart(rows: list[dict], threshold: int = 15) -> list:
    deduped = _deduplicate_by_mla_day(rows)
    imap = defaultdict(lambda: {"count": 0, "total": 0, "usuario": ""})
    for row in deduped:
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        pct = normalise_pct(row.get(PCT_DIF_COL))
        imap[razon]["total"] += 1
        imap[razon]["usuario"] = (row.get(USUARIO_ML_COL) or "").strip()
        if pct is not None and abs(pct) >= threshold:
            imap[razon]["count"] += 1
    results = []
    for name, d in imap.items():
        if d["total"] > 0:
            results.append({
                "name": name[:40] + "…" if len(name) > 40 else name,
                "fullName": name,
                "count": d["count"],
                "total": d["total"],
                "pctInfraccion": round(100 * d["count"] / d["total"]),
                "usuario": d["usuario"],
            })
    results.sort(key=lambda x: x["count"], reverse=True)
    return results[:50]


def build_high_deviation_chart(rows: list[dict], threshold: int = 40) -> list:
    deduped = _deduplicate_by_mla_day(rows)
    dmap = defaultdict(lambda: {"count": 0, "total": 0, "usuario": ""})
    for row in deduped:
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        pct = normalise_pct(row.get(PCT_DIF_COL))
        dmap[razon]["total"] += 1
        dmap[razon]["usuario"] = (row.get(USUARIO_ML_COL) or "").strip()
        if pct is not None and abs(pct) >= threshold:
            dmap[razon]["count"] += 1
    results = []
    for name, d in dmap.items():
        if d["total"] > 0:
            results.append({
                "name": name[:40] + "…" if len(name) > 40 else name,
                "fullName": name,
                "count": d["count"],
                "total": d["total"],
                "pctHighDeviation": round(100 * d["count"] / d["total"]),
                "usuario": d["usuario"],
            })
    results = [r for r in results if r["count"] > 0]
    results.sort(key=lambda x: x["count"], reverse=True)
    return results[:50]


def build_sku_deviation_chart(rows: list[dict]) -> list:
    top = _top_score()
    deduped = _deduplicate_by_mla_day(rows)
    smap = defaultdict(lambda: {"count": 0, "total": 0, "pct_sum": 0, "descripcion": "", "rot": ""})
    for row in deduped:
        sku = (row.get(SKU_COL) or row.get(MLA_COL) or "Sin SKU").strip()
        pct = normalise_pct(row.get(PCT_DIF_COL))
        score = row.get("score")
        smap[sku]["total"] += 1
        smap[sku]["descripcion"] = (row.get("DESCRIPCION") or "").strip()
        if not smap[sku]["rot"]:
            smap[sku]["rot"] = (row.get(ROT_COL) or "").strip().upper()
        if pct is not None:
            smap[sku]["pct_sum"] += abs(pct)
        if score is not None and 0 < score < top:
            smap[sku]["count"] += 1
    results = []
    for sku, d in smap.items():
        if d["count"] > 0:
            avg_abs = d["pct_sum"] / d["total"] if d["total"] > 0 else 0
            if avg_abs > 0:
                avg_pct = -math.ceil(avg_abs) if avg_abs - math.floor(avg_abs) >= 0.5 else -math.floor(avg_abs)
            else:
                avg_pct = 0
            avg_pct = max(-100, min(-1, avg_pct))
            results.append({
                "sku": sku,
                "name": sku,
                "count": d["count"],
                "total": d["total"],
                "pctInfraccion": round(100 * d["count"] / d["total"]),
                "avgPct": avg_pct,
                "descripcion": d["descripcion"],
                "rot": d["rot"],
            })
    results.sort(key=lambda x: x["count"], reverse=True)
    return results[:20]


def build_rot_chart(rows: list[dict]) -> list:
    top = _top_score()
    rmap = defaultdict(lambda: {"scores": [], "infraction_count": 0, "total": 0})
    for row in rows:
        rot = (row.get(ROT_COL) or "").strip().upper()
        if not rot:
            continue
        score = row.get("score")
        rmap[rot]["total"] += 1
        if score is not None:
            try:
                score_num = int(score)
            except (ValueError, TypeError):
                score_num = None
            if score_num is not None:
                rmap[rot]["scores"].append(score_num)
                if 0 < score_num < top:
                    rmap[rot]["infraction_count"] += 1
    results = []
    for rot, d in rmap.items():
        scores = d["scores"]
        results.append({
            "rot": rot,
            "name": rot,
            "avgScore": round(sum(scores) / len(scores)) if scores else 0,
            "pctInfraccion": round(100 * d["infraction_count"] / d["total"]) if d["total"] else 0,
            "total": d["total"],
        })
    results.sort(key=lambda x: ROT_ORDER.index(x["rot"]) if x["rot"] in ROT_ORDER else 99)
    return results


def build_deviation_chart(rows: list[dict]) -> list:
    top = _top_score()
    deduped = _deduplicate_by_sku_day(rows)
    dmap = defaultdict(lambda: {"count": 0, "total": 0, "usuario": ""})
    for row in deduped:
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        score = row.get("score")
        dmap[razon]["total"] += 1
        dmap[razon]["usuario"] = (row.get(USUARIO_ML_COL) or "").strip()
        try:
            score_num = int(score) if score is not None else 0
        except (ValueError, TypeError):
            score_num = 0
        if 0 < score_num < top:
            dmap[razon]["count"] += 1
    results = []
    for name, d in dmap.items():
        if d["total"] > 0:
            results.append({
                "name": name[:40] + "…" if len(name) > 40 else name,
                "fullName": name,
                "count": d["count"],
                "total": d["total"],
                "pctDeviation": round(100 * d["count"] / d["total"]),
                "usuario": d["usuario"],
            })
    results = [r for r in results if r["count"] > 0]
    results.sort(key=lambda x: x["count"], reverse=True)
    return results[:15]


def build_monthly_summary(rows: list[dict]) -> dict:
    top = _top_score()
    deduped = _deduplicate_by_mla_day(rows)
    sku_pcts: dict[str, list[float]] = defaultdict(list)
    sku_scores: dict[str, list[int]] = defaultdict(list)
    for row in deduped:
        sku = str(row.get(SKU_COL) or row.get(MLA_COL) or "").strip()
        if not sku:
            continue
        pct = normalise_pct(row.get(PCT_DIF_COL))
        if pct is not None:
            sku_pcts[sku].append(abs(pct))
        score = row.get("score")
        if score is not None:
            try:
                sku_scores[sku].append(int(score))
            except (TypeError, ValueError):
                pass
    sku_avgs = [sum(v) / len(v) for v in sku_pcts.values() if v]
    avg_deviation = round(sum(sku_avgs) / len(sku_avgs), 1) if sku_avgs else 0

    level_counts: dict[int, int] = defaultdict(int)
    for scores in sku_scores.values():
        if not scores:
            continue
        avg_score = max(1, min(top, round(sum(scores) / len(scores))))
        level_counts[avg_score] += 1
    total_skus_scored = sum(level_counts.values())
    level_distribution = [
        {
            "level": level,
            "count": level_counts.get(level, 0),
            "pct": round(100 * level_counts.get(level, 0) / total_skus_scored) if total_skus_scored else 0,
        }
        for level in range(1, top + 1)
    ]

    return {
        "skuCount": len(sku_pcts),
        "avgDeviation": avg_deviation,
        "levelDistribution": level_distribution,
    }


def build_monthly_deviation_chart(rows: list[dict]) -> list:
    top = _top_score()
    deduped = _deduplicate_by_mla_day(rows)
    mmap = defaultdict(lambda: defaultdict(lambda: {"count": 0, "total": 0, "score_sum": 0.0}))
    for row in deduped:
        razon = (row.get(RAZON_SOCIAL_COL) or "Sin nombre").strip()
        fecha = str(row.get(FECHA_COL) or "")[:7]
        if not fecha or len(fecha) < 7:
            continue
        score = row.get("score")
        try:
            score_num = int(score) if score is not None else 0
        except (ValueError, TypeError):
            score_num = 0
        mmap[fecha][razon]["total"] += 1
        if score_num > 0:
            mmap[fecha][razon]["score_sum"] += score_num
            if score_num < top:
                mmap[fecha][razon]["count"] += 1
    results = []
    for month in sorted(mmap.keys()):
        month_total = month_count = month_score_count = 0
        month_score_sum = 0.0
        for razon, d in mmap[month].items():
            month_total += d["total"]
            month_count += d["count"]
            month_score_sum += d["score_sum"]
            month_score_count += d["total"]
        if month_total > 0:
            results.append({
                "month": month,
                "count": month_count,
                "total": month_total,
                "pctDeviation": round(100 * month_count / month_total),
                "avgScore": round(month_score_sum / month_score_count) if month_score_count > 0 else 0,
            })
    return results
