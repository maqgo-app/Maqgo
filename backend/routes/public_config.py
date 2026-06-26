import os

from fastapi import APIRouter


router = APIRouter(prefix="/public-config", tags=["public"])


@router.get("", response_model=dict)
async def public_config():
    google_maps_api_key = (
        os.environ.get("GOOGLE_MAPS_API_KEY")
        or os.environ.get("WEB_GOOGLE_MAPS_API_KEY")
        or os.environ.get("VITE_GOOGLE_MAPS_API_KEY")
        or ""
    ).strip()
    if google_maps_api_key in ("undefined", "null"):
        google_maps_api_key = ""

    return {
        "googleMapsApiKey": google_maps_api_key or None,
        "googleMapsEnabled": bool(google_maps_api_key),
    }

