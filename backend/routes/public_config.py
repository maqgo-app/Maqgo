import os

from fastapi import APIRouter

from services.google_maps_key_service import get_google_maps_api_key


router = APIRouter(prefix="/public-config", tags=["public"])


@router.get("", response_model=dict)
async def public_config():
    google_maps_api_key = await get_google_maps_api_key()

    return {
        "googleMapsApiKey": google_maps_api_key or None,
        "googleMapsEnabled": bool(google_maps_api_key),
    }
