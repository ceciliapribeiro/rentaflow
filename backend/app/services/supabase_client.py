"""
services/supabase_client.py — Cliente Supabase para o RentaFlow v2.0
"""
from supabase import create_client, Client
from ..config import get_settings

settings = get_settings()

_supabase: Client = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL e SUPABASE_KEY devem estar definidos no .env"
            )
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase
