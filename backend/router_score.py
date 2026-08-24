import math

from fastapi import APIRouter, Depends, HTTPException, Request

from scoring import get_default_threshold, get_score_config, save_default_threshold, save_score_config
from security import CsrfUser, get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/score-config")
def get_score_config_endpoint():
    return {"bands": get_score_config(), "defaultThreshold": get_default_threshold()}


@router.put("/score-config")
async def put_score_config_endpoint(request: Request, user: CsrfUser):
    body = await request.json()
    bands = body.get("bands", [])
    if not isinstance(bands, list) or not 1 <= len(bands) <= 12:
        raise HTTPException(status_code=400, detail="Se requiere al menos un intervalo")
    try:
        bands = [float(b) for b in bands]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Los umbrales deben ser números")
    if any(not math.isfinite(value) or value <= 0 or value > 10_000 for value in bands):
        raise HTTPException(status_code=400, detail="Los umbrales deben ser valores positivos y finitos")
    for i in range(1, len(bands)):
        if bands[i] <= bands[i - 1]:
            raise HTTPException(status_code=400, detail="Los umbrales deben ser estrictamente crecientes")

    default_threshold = get_default_threshold()
    if "defaultThreshold" in body:
        try:
            default_threshold = float(body["defaultThreshold"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="El % permitido por defecto debe ser un número")
        if not math.isfinite(default_threshold) or default_threshold <= 0 or default_threshold > 10_000:
            raise HTTPException(status_code=400, detail="El % permitido por defecto debe ser mayor a 0")
        save_default_threshold(default_threshold)

    save_score_config(bands)
    return {"bands": bands, "defaultThreshold": default_threshold}
