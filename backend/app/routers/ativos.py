"""
routers/ativos.py — CRUD de ativos (catálogo B3)
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from ..services.supabase_client import get_supabase
from ..schemas.ativo import AtivoOut, AtivoCreate

router = APIRouter(prefix="/ativos", tags=["Ativos"])


@router.get("/", response_model=List[AtivoOut])
async def listar_ativos(tipo: Optional[str] = None, limit: int = 100, offset: int = 0):
    sb = get_supabase()
    query = sb.table("ativos").select("*")
    if tipo:
        query = query.eq("tipo", tipo)
    result = query.range(offset, offset + limit - 1).execute()
    return result.data


@router.get("/busca")
async def buscar_ativo(q: str):
    sb = get_supabase()
    result = sb.table("ativos").select("*").ilike("ticker", f"%{q}%").limit(20).execute()
    return result.data


@router.get("/{ticker}", response_model=AtivoOut)
async def obter_ativo(ticker: str):
    sb = get_supabase()
    result = sb.table("ativos").select("*").eq("ticker", ticker.upper()).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Ativo {ticker} não encontrado")
    return result.data[0]


@router.post("/", response_model=AtivoOut)
async def criar_ativo(ativo: AtivoCreate):
    sb = get_supabase()
    result = sb.table("ativos").insert(ativo.model_dump()).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao criar ativo")
    return result.data[0]


@router.put("/{ticker}", response_model=AtivoOut)
async def atualizar_ativo(ticker: str, ativo: AtivoCreate):
    sb = get_supabase()
    result = (
        sb.table("ativos")
        .update(ativo.model_dump())
        .eq("ticker", ticker.upper())
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Ativo {ticker} não encontrado")
    return result.data[0]
