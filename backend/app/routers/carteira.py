"""
routers/carteira.py — CRUD da carteira do usuário
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from ..services.supabase_client import get_supabase
from ..auth.jwt import verify_token
from ..schemas.ativo import CarteiraOut, CarteiraCreate

router = APIRouter(prefix="/carteira", tags=["Carteira"])


@router.get("/", response_model=List[CarteiraOut])
async def listar_carteira(user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = sb.table("carteira").select("*").eq("user_id", user_id).execute()
    return result.data


@router.post("/", response_model=CarteiraOut)
async def adicionar_ativo(item: CarteiraCreate, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    dados = item.model_dump()
    dados["user_id"] = user_id
    result = sb.table("carteira").insert(dados).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao adicionar ativo à carteira")
    return result.data[0]


@router.put("/{ticker}")
async def atualizar_ativo_carteira(ticker: str, item: CarteiraCreate,
                                    user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = (
        sb.table("carteira")
        .update(item.model_dump())
        .eq("user_id", user_id)
        .eq("ticker", ticker.upper())
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Ativo {ticker} não encontrado na carteira")
    return result.data[0]


@router.delete("/{ticker}")
async def remover_ativo_carteira(ticker: str, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = (
        sb.table("carteira")
        .delete()
        .eq("user_id", user_id)
        .eq("ticker", ticker.upper())
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Ativo {ticker} não encontrado na carteira")
    return {"detail": f"Ativo {ticker} removido da carteira"}
