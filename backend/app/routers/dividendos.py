"""
routers/dividendos.py — CRUD de dividendos (proventos recebidos)
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from ..services.supabase_client import get_supabase
from ..auth.jwt import verify_token
from ..schemas.ativo import DividendoOut, DividendoCreate

router = APIRouter(prefix="/dividendos", tags=["Dividendos"])


@router.get("/", response_model=List[DividendoOut])
async def listar_dividendos(
    ticker: Optional[str] = None,
    ano: Optional[int] = None,
    limit: int = 1000,
    offset: int = 0,
    user_id: str = Depends(verify_token),
):
    sb = get_supabase()
    query = sb.table("dividendos").select("*").eq("user_id", user_id)
    if ticker:
        query = query.eq("ticker", ticker.upper())
    if ano:
        query = query.eq("ano", ano)
    result = query.order("data_pagamento", desc=True).range(offset, offset + limit - 1).execute()
    return result.data


@router.get("/resumo")
async def resumo_dividendos(ano: Optional[int] = None, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    query = sb.table("dividendos").select("*").eq("user_id", user_id)
    if ano:
        query = query.eq("ano", ano)
    result = query.execute()

    total = 0.0
    por_ticker = {}
    por_tipo = {"RENDIMENTO": 0.0, "JUROS": 0.0}

    for d in result.data:
        valor = float(d.get("valor", 0))
        total += valor
        ticker = d.get("ticker", "?")
        tipo = d.get("tipo_provento", "RENDIMENTO")

        por_ticker[ticker] = por_ticker.get(ticker, 0) + valor
        if tipo in por_tipo:
            por_tipo[tipo] += valor

    return {
        "total": round(total, 2),
        "por_ticker": {k: round(v, 2) for k, v in sorted(por_ticker.items(), key=lambda x: -x[1])},
        "por_tipo": {k: round(v, 2) for k, v in por_tipo.items()},
        "quantidade": len(result.data),
    }


@router.post("/", response_model=DividendoOut)
async def criar_dividendo(div: DividendoCreate, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    dados = div.model_dump()
    dados["user_id"] = user_id
    dados["data_pagamento"] = str(dados["data_pagamento"])
    result = sb.table("dividendos").insert(dados).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao criar dividendo")
    return result.data[0]


@router.post("/lote", response_model=List[DividendoOut])
async def criar_dividendos_lote(divs: List[DividendoCreate],
                                 user_id: str = Depends(verify_token)):
    sb = get_supabase()
    registros = []
    for div in divs:
        dados = div.model_dump()
        dados["user_id"] = user_id
        dados["data_pagamento"] = str(dados["data_pagamento"])
        registros.append(dados)
    result = sb.table("dividendos").insert(registros).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao criar dividendos em lote")
    return result.data


@router.delete("/{dividendo_id}")
async def deletar_dividendo(dividendo_id: int, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = (
        sb.table("dividendos")
        .delete()
        .eq("id", dividendo_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Dividendo não encontrado")
    return {"detail": "Dividendo removido"}
