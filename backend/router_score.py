from fastapi import APIRouter, HTTPException, Request

from scoring import get_score_config, save_score_config

router = APIRouter()


@router.get("/score-config")
def get_score_config_endpoint():
    return {"bands": get_score_config()}


@router.put("/score-config")
async def put_score_config_endpoint(request: Request):
    body = await request.json()
    bands = body.get("bands", [])
    if not bands:
        raise HTTPException(status_code=400, detail="Se requiere al menos un intervalo")
    try:
        bands = [float(b) for b in bands]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Los umbrales deben ser números")
    for i in range(1, len(bands)):
        if bands[i] <= bands[i - 1]:
            raise HTTPException(status_code=400, detail="Los umbrales deben ser estrictamente crecientes")
    save_score_config(bands)
    return {"bands": bands}
