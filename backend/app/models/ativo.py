"""
models/ativo.py — Modelos de dados do RentaFlow v2.0
"""
from sqlalchemy import Column, String, Integer, Numeric, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from ..database import Base


class Ativo(Base):
    __tablename__ = "ativos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, unique=True, nullable=False)
    tipo = Column(String)
    razao_social = Column(String)
    cnpj = Column(String)
    segmento = Column(String)
    preco = Column(Numeric(12, 2), default=0)
    dy = Column(Numeric(8, 2), default=0)
    pvp = Column(Numeric(8, 2), default=0)
    short_name = Column(String)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Carteira(Base):
    __tablename__ = "carteira"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    ticker = Column(String, nullable=False)
    qtde_ideal = Column(Numeric(12, 2), default=0)
    peso_ideal = Column(Numeric(8, 4), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Operacao(Base):
    __tablename__ = "operacoes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    data = Column(Date, nullable=False)
    ticker = Column(String, nullable=False)
    quantidade = Column(Numeric(12, 2), nullable=False)
    preco_unitario = Column(Numeric(12, 4), nullable=False)
    tipo_ativo = Column(String)
    operacao = Column(String, nullable=False)
    qtde_executada = Column(Numeric(12, 2))
    vl_real_venda = Column(Numeric(12, 4))
    origem = Column(String, default="manual")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Dividendo(Base):
    __tablename__ = "dividendos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    ano = Column(Integer)
    data_pagamento = Column(Date, nullable=False)
    ticker = Column(String, nullable=False)
    valor = Column(Numeric(12, 4), nullable=False)
    tipo_provento = Column(String, default="RENDIMENTO")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Aporte(Base):
    __tablename__ = "aportes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    data = Column(Date, nullable=False)
    valor = Column(Numeric(12, 2), nullable=False)
    descricao = Column(String, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
