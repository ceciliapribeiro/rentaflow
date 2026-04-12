"""
routers/operacoes.py — CRUD de operações (compras e vendas)
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from ..services.supabase_client import get_supabase
from ..auth.jwt import verify_token
from ..schemas.ativo import OperacaoOut, OperacaoCreate

router = APIRouter(prefix="/operacoes", tags=["Operações"])


@router.get("/", response_model=List[OperacaoOut])
async def listar_operacoes(
    ticker: Optional[str] = None,
    operacao: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    user_id: str = Depends(verify_token),
):
    sb = get_supabase()
    query = sb.table("operacoes").select("*").eq("user_id", user_id)
    if ticker:
        query = query.eq("ticker", ticker.upper())
    if operacao:
        query = query.eq("operacao", operacao.upper())
    result = query.order("data", desc=True).range(offset, offset + limit - 1).execute()
    return result.data


@router.get("/{operacao_id}", response_model=OperacaoOut)
async def obter_operacao(operacao_id: int, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = (
        sb.table("operacoes")
        .select("*")
        .eq("id", operacao_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Operação não encontrada")
    return result.data[0]


@router.post("/", response_model=OperacaoOut)
async def criar_operacao(op: OperacaoCreate, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    dados = op.model_dump()
    dados["user_id"] = user_id
    dados["data"] = str(dados["data"])
    result = sb.table("operacoes").insert(dados).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao criar operação")
    return result.data[0]


@router.put("/{operacao_id}", response_model=OperacaoOut)
async def atualizar_operacao(
    operacao_id: int, op: OperacaoCreate, user_id: str = Depends(verify_token)
):
    sb = get_supabase()
    dados = op.model_dump()
    dados["data"] = str(dados["data"])
    result = (
        sb.table("operacoes")
        .update(dados)
        .eq("id", operacao_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Operação não encontrada")
    return result.data[0]


@router.delete("/{operacao_id}")
async def deletar_operacao(operacao_id: int, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = (
        sb.table("operacoes")
        .delete()
        .eq("id", operacao_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Operação não encontrada")
    return {"detail": "Operação removida com sucesso"}
