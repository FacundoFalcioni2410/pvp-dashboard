from fastapi import APIRouter, Depends, HTTPException

from database import delete_dataset_from_catalog, list_datasets_from_catalog
from security import CsrfUser, get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/datasets")
def get_datasets():
    return list_datasets_from_catalog()


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: int, user: CsrfUser):
    datasets = list_datasets_from_catalog()
    if not any(d["id"] == dataset_id for d in datasets):
        raise HTTPException(status_code=404, detail="Dataset not found")
    delete_dataset_from_catalog(dataset_id)
    return {"deleted": dataset_id, "datasets": list_datasets_from_catalog()}
