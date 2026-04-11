"""
database.py — Conexão com PostgreSQL via SQLAlchemy async
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import get_settings

settings = get_settings()

# Converte postgres:// para postgresql+asyncpg://
db_url = settings.DATABASE_URL
if db_url:
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://")

engine = create_async_engine(db_url or "sqlite+aiosqlite:///./dev.db", echo=settings.DEBUG)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
