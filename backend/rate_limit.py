"""
Rate limiting para endpoints sensibles.
Uso: @limiter.limit("5/minute") en rutas que reciban Request.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
