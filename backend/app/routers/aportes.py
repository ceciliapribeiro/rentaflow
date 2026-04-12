"""
routers/aportes.py — CRUD de aportes de capital
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from ..services.supabase_client import get_supabase
from ..auth.jwt import verify_token
from ..schemas.ativo import AporteOut, AporteCreate

router = APIRouter(prefix="/aportes", tags=["Aportes"])


@router.get("/", response_model=List[AporteOut])
async def listar_aportes(
    limit: int = 500,
    offset: int = 0,
    user_id: str = Depends(verify_token),
):
    sb = get_supabase()
    result = (
        sb.table("aportes")
        .select("*")
        .eq("user_id", user_id)
        .order("data", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data


@router.get("/resumo")
async def resumo_aportes(ano: Optional[int] = None, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    query = sb.table("aportes").select("*").eq("user_id", user_id)
    result = query.execute()

    total = 0.0
    por_ano = {}

    for a in result.data:
        valor = float(a.get("valor", 0))
        total += valor
        data_str = a.get("data", "")
        if data_str:
            ano_aporte = int(str(data_str)[:4])
            por_ano[ano_aporte] = por_ano.get(ano_aporte, 0) + valor

    return {
        "total": round(total, 2),
        "por_ano": {k: round(v, 2) for k, v in sorted(por_ano.items(), reverse=True)},
        "quantidade": len(result.data),
    }


@router.post("/", response_model=AporteOut)
async def criar_aporte(aporte: AporteCreate, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    dados = aporte.model_dump()
    dados["user_id"] = user_id
    dados["data"] = str(dados["data"])
    result = sb.table("aportes").insert(dados).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao criar aporte")
    return result.data[0]


@router.post("/lote", response_model=List[AporteOut])
async def criar_aportes_lote(aportes: List[AporteCreate],
                              user_id: str = Depends(verify_token)):
    sb = get_supabase()
    registros = []
    for aporte in aportes:
        dados = aporte.model_dump()
        dados["user_id"] = user_id
        dados["data"] = str(dados["data"])
        registros.append(dados)
    result = sb.table("aportes").insert(registros).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Erro ao criar aportes em lote")
    return result.data


@router.delete("/{aporte_id}")
async def deletar_aporte(aporte_id: int, user_id: str = Depends(verify_token)):
    sb = get_supabase()
    result = (
        sb.table("aportes")
        .delete()
        .eq("id", aporte_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Aporte não encontrado")
    return {"detail": "Aporte removido"}
