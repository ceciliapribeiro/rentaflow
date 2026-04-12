"""
schemas/ativo.py — Schemas Pydantic para validação de dados
"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime


# ══════════════════════════════════════════════════════════════════
# PROFILE (Usuário)
# ══════════════════════════════════════════════════════════════════
class ProfileBase(BaseModel):
    nome: str
    email: EmailStr
    plano: str = "free"
    senha_pdf: str = ""
    janela_busca_dias: int = 365

class ProfileCreate(ProfileBase):
    pass

class ProfileOut(ProfileBase):
    id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════
# ATIVO (Catálogo B3)
# ══════════════════════════════════════════════════════════════════
class AtivoBase(BaseModel):
    ticker: str
    tipo: Optional[str] = None
    razao_social: Optional[str] = None
    cnpj: Optional[str] = None
    segmento: Optional[str] = None
    preco: float = 0
    dy: float = 0
    pvp: float = 0
    short_name: Optional[str] = None

class AtivoCreate(AtivoBase):
    pass

class AtivoOut(AtivoBase):
    id: int
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════
# CARTEIRA
# ══════════════════════════════════════════════════════════════════
class CarteiraBase(BaseModel):
    ticker: str
    qtde_ideal: float = 0
    peso_ideal: float = 0

class CarteiraCreate(CarteiraBase):
    pass

class CarteiraOut(CarteiraBase):
    id: int
    user_id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════
# OPERAÇÃO (Compra/Venda)
# ══════════════════════════════════════════════════════════════════
class OperacaoBase(BaseModel):
    data: date
    ticker: str
    quantidade: float
    preco_unitario: float
    tipo_ativo: Optional[str] = None
    operacao: str  # COMPRA ou VENDA
    qtde_executada: Optional[float] = None
    vl_real_venda: Optional[float] = None
    origem: str = "manual"

class OperacaoCreate(OperacaoBase):
    pass

class OperacaoOut(OperacaoBase):
    id: int
    user_id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════
# DIVIDENDO
# ══════════════════════════════════════════════════════════════════
class DividendoBase(BaseModel):
    ano: Optional[int] = None
    data_pagamento: date
    ticker: str
    valor: float
    tipo_provento: str = "RENDIMENTO"

class DividendoCreate(DividendoBase):
    pass

class DividendoOut(DividendoBase):
    id: int
    user_id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════
# APORTE
# ══════════════════════════════════════════════════════════════════
class AporteBase(BaseModel):
    data: date
    valor: float
    descricao: str = ""

class AporteCreate(AporteBase):
    pass

class AporteOut(AporteBase):
    id: int
    user_id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
