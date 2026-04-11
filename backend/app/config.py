"""
config.py — Configurações centralizadas do backend RentaFlow v2.0
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "RentaFlow API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Database (PostgreSQL direto via SQLAlchemy)
    DATABASE_URL: str = ""

    # JWT Auth
    SECRET_KEY: str = "chave-temporaria-trocar-em-producao"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Stripe (pagamentos)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_PREMIUM: str = ""

    # APIs externas
    STATUS_INVEST_DELAY: float = 0.5
    YAHOO_FINANCE_TIMEOUT: int = 10

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
