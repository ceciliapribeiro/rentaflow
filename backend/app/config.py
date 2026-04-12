"""
config.py — Configurações do RentaFlow v2.0
"""
import os
from functools import lru_cache
from dotenv import load_dotenv

# Carrega o .env da pasta backend
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(env_path)


class Settings:
    APP_NAME: str = "RentaFlow"
    APP_VERSION: str = "2.0.0"

    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "trocar-em-producao")


@lru_cache()
def get_settings() -> Settings:
    return Settings()
