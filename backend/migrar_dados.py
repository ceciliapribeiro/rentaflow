import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = "f5775d17-a46a-46bc-99cd-e4cf1cb6b795"

print("=" * 50)
print("  MIGRACAO DE DADOS -> SUPABASE")
print("=" * 50)

# 1. APORTES (user_id, data, valor)
aportes = [
    {"data": "2023-07-04", "valor": 16.53},
    {"data": "2023-08-30", "valor": 0.26},
    {"data": "2023-10-26", "valor": 10.00},
    {"data": "2023-11-09", "valor": 10.00},
    {"data": "2023-11-17", "valor": 0.65},
    {"data": "2023-11-29", "valor": 26.20},
    {"data": "2024-01-22", "valor": 0.32},
    {"data": "2024-03-20", "valor": 3.80},
    {"data": "2024-04-25", "valor": 17.00},
    {"data": "2024-05-16", "valor": 5.00},
    {"data": "2024-06-24", "valor": 4.60},
    {"data": "2024-07-22", "valor": 6.37},
    {"data": "2024-07-29", "valor": 12.00},
    {"data": "2024-09-10", "valor": 14.11},
    {"data": "2024-09-26", "valor": 10.30},
    {"data": "2024-09-26", "valor": 22.91},
    {"data": "2024-11-05", "valor": 32.00},
    {"data": "2024-12-03", "valor": 2.45},
    {"data": "2024-12-05", "valor": 1001.96},
    {"data": "2025-01-06", "valor": 100.00},
    {"data": "2025-01-28", "valor": 34.85},
    {"data": "2025-02-08", "valor": -331.77},
    {"data": "2025-02-18", "valor": 0.75},
    {"data": "2025-03-06", "valor": 5.00},
    {"data": "2025-04-07", "valor": 400.00},
    {"data": "2025-04-10", "valor": 1.50},
    {"data": "2025-04-11", "valor": 3900.00},
    {"data": "2025-04-24", "valor": 100.00},
    {"data": "2025-04-29", "valor": 67.44},
    {"data": "2025-05-20", "valor": 400.00},
    {"data": "2025-05-29", "valor": 100.00},
    {"data": "2025-06-17", "valor": 810.00},
    {"data": "2025-06-23", "valor": 1300.00},
    {"data": "2025-07-30", "valor": 12.59},
    {"data": "2025-08-11", "valor": 300.00},
    {"data": "2025-08-25", "valor": 459.30},
    {"data": "2025-09-17", "valor": 100.00},
    {"data": "2025-10-23", "valor": 110.00},
    {"data": "2025-11-13", "valor": 110.59},
    {"data": "2025-12-29", "valor": 400.00},
    {"data": "2025-12-29", "valor": 600.59},
    {"data": "2026-01-05", "valor": 500.00},
    {"data": "2026-01-12", "valor": 743.10},
]

print("\n[1/3] Inserindo aportes...")
ok = 0
for i, a in enumerate(aportes, 1):
    try:
        supabase.table("aportes").insert({
            "user_id": USER_ID,
            "data": a["data"],
            "valor": a["valor"]
        }).execute()
        ok += 1
    except Exception as e:
        print(f"  Erro aporte {i}: {e}")
print(f"  {ok}/{len(aportes)} aportes inseridos com sucesso.")

# 2. ATIVOS (ticker, tipo, segmento, preco, dy)
print("\n[2/3] Inserindo ativos...")
ativos = [
    {"ticker": "AAZQ11", "tipo": "FII", "segmento": "Fiagro", "preco": 8.01, "dy": 0.00},
    {"ticker": "ALZR11", "tipo": "FII", "segmento": "Hibrido", "preco": 10.71, "dy": 9.36},
    {"ticker": "ARRI11", "tipo": "FII", "segmento": "CRIs", "preco": 6.78, "dy": 15.93},
    {"ticker": "BBAS3", "tipo": "Acao", "segmento": "Financeiro", "preco": 23.27, "dy": 3.58},
    {"ticker": "BBDC4", "tipo": "Acao", "segmento": "Financeiro", "preco": 19.55, "dy": 7.21},
    {"ticker": "BIDB11", "tipo": "FII", "segmento": "FI-Infra", "preco": 81.30, "dy": 0.00},
    {"ticker": "BIME11", "tipo": "FII", "segmento": "Hibrido", "preco": 6.31, "dy": 15.21},
    {"ticker": "BTHF11", "tipo": "FII", "segmento": "Hibrido", "preco": 9.29, "dy": 12.23},
    {"ticker": "CMIG4", "tipo": "Acao", "segmento": "Energia", "preco": 12.24, "dy": 13.49},
    {"ticker": "CPSH11", "tipo": "FII", "segmento": "Shoppings", "preco": 10.67, "dy": 12.18},
    {"ticker": "CPTS11", "tipo": "FII", "segmento": "CRIs", "preco": 7.94, "dy": 13.26},
    {"ticker": "CURY3", "tipo": "Acao", "segmento": "Construtora", "preco": 33.06, "dy": 13.28},
    {"ticker": "CXSE3", "tipo": "Acao", "segmento": "Seguradora", "preco": 17.35, "dy": 7.49},
    {"ticker": "CYRE3", "tipo": "Acao", "segmento": "Construtora", "preco": 25.05, "dy": 15.17},
    {"ticker": "DEVA11", "tipo": "FII", "segmento": "CRIs", "preco": 23.35, "dy": 19.53},
    {"ticker": "DIRR3", "tipo": "Acao", "segmento": "Construtora", "preco": 13.41, "dy": 16.53},
    {"ticker": "EQIR11", "tipo": "FII", "segmento": "CRIs", "preco": 8.59, "dy": 15.20},
    {"ticker": "FYTO11", "tipo": "FII", "segmento": "CRIs", "preco": 8.44, "dy": 14.50},
    {"ticker": "GARE11", "tipo": "FII", "segmento": "Logistica", "preco": 8.33, "dy": 11.96},
    {"ticker": "HGBL11", "tipo": "FII", "segmento": "Logistica", "preco": 9.27, "dy": 9.58},
    {"ticker": "INLG11", "tipo": "FII", "segmento": "Logistica", "preco": 74.33, "dy": 11.74},
    {"ticker": "IRIM11", "tipo": "FII", "segmento": "CRIs", "preco": 62.45, "dy": 15.45},
    {"ticker": "ISAE4", "tipo": "Acao", "segmento": "Energia", "preco": 27.89, "dy": 7.95},
    {"ticker": "ITSA4", "tipo": "Acao", "segmento": "Financeiro", "preco": 13.10, "dy": 9.67},
    {"ticker": "ITUB4", "tipo": "Acao", "segmento": "Financeiro", "preco": 41.55, "dy": 7.58},
    {"ticker": "KISU11", "tipo": "FII", "segmento": "Fundo de Fundos", "preco": 7.00, "dy": 12.00},
    {"ticker": "LIFE11", "tipo": "FII", "segmento": "CRIs", "preco": 8.94, "dy": 16.11},
    {"ticker": "MCCI11", "tipo": "FII", "segmento": "CRIs", "preco": 95.00, "dy": 12.21},
    {"ticker": "PETR4", "tipo": "Acao", "segmento": "Petroleo", "preco": 45.67, "dy": 7.19},
    {"ticker": "POMO4", "tipo": "Acao", "segmento": "Bens Industriais", "preco": 5.77, "dy": 17.85},
    {"ticker": "RAIZ4", "tipo": "Acao", "segmento": "Petroleo", "preco": 0.55, "dy": 0.00},
    {"ticker": "RECV3", "tipo": "Acao", "segmento": "Petroleo", "preco": 12.72, "dy": 15.31},
    {"ticker": "RURA11", "tipo": "FII", "segmento": "Fiagro", "preco": 8.98, "dy": 0.00},
    {"ticker": "SNAG11", "tipo": "FII", "segmento": "Fiagro", "preco": 10.65, "dy": 0.00},
    {"ticker": "TEPP11", "tipo": "FII", "segmento": "Hibrido", "preco": 8.93, "dy": 11.39},
    {"ticker": "TRXF11", "tipo": "FII", "segmento": "Hibrido", "preco": 91.60, "dy": 12.89},
    {"ticker": "VALE3", "tipo": "Acao", "segmento": "Mineracao", "preco": 75.55, "dy": 7.25},
    {"ticker": "VGRI11", "tipo": "FII", "segmento": "Lajes Corporativas", "preco": 8.35, "dy": 17.25},
    {"ticker": "VINO11", "tipo": "FII", "segmento": "Lajes Corporativas", "preco": 5.00, "dy": 12.40},
    {"ticker": "XPML11", "tipo": "FII", "segmento": "Shoppings", "preco": 108.45, "dy": 10.19},
]

ok = 0
for i, at in enumerate(ativos, 1):
    try:
        supabase.table("ativos").insert(at).execute()
        ok += 1
    except Exception as e:
        print(f"  Erro ativo {i} ({at['ticker']}): {e}")
print(f"  {ok}/{len(ativos)} ativos inseridos com sucesso.")

# 3. DIVIDENDOS (user_id, ano, Data_pagamento, ticker, valor, tipo provento)
print("\n[3/3] Inserindo dividendos...")
dividendos = [
    {"Data_pagamento": "2026-01-15", "valor": 2.65, "tipo provento": "RENDIMENTO", "ticker": "AAZQ11", "ano": 2026},
    {"Data_pagamento": "2026-02-13", "valor": 2.10, "tipo provento": "RENDIMENTO", "ticker": "AAZQ11", "ano": 2026},
    {"Data_pagamento": "2026-03-13", "valor": 2.10, "tipo provento": "RENDIMENTO", "ticker": "AAZQ11", "ano": 2026},
    {"Data_pagamento": "2026-01-08", "valor": 3.60, "tipo provento": "RENDIMENTO", "ticker": "ARRI11", "ano": 2026},
    {"Data_pagamento": "2026-02-06", "valor": 3.60, "tipo provento": "RENDIMENTO", "ticker": "ARRI11", "ano": 2026},
    {"Data_pagamento": "2026-03-06", "valor": 3.60, "tipo provento": "RENDIMENTO", "ticker": "ARRI11", "ano": 2026},
    {"Data_pagamento": "2026-01-15", "valor": 5.20, "tipo provento": "RENDIMENTO", "ticker": "BIME11", "ano": 2026},
    {"Data_pagamento": "2026-02-13", "valor": 5.20, "tipo provento": "RENDIMENTO", "ticker": "BIME11", "ano": 2026},
    {"Data_pagamento": "2026-03-13", "valor": 4.55, "tipo provento": "RENDIMENTO", "ticker": "BIME11", "ano": 2026},
    {"Data_pagamento": "2026-01-08", "valor": 4.23, "tipo provento": "RENDIMENTO", "ticker": "GARE11", "ano": 2026},
    {"Data_pagamento": "2026-02-06", "valor": 4.23, "tipo provento": "RENDIMENTO", "ticker": "GARE11", "ano": 2026},
    {"Data_pagamento": "2026-03-06", "valor": 4.23, "tipo provento": "RENDIMENTO", "ticker": "GARE11", "ano": 2026},
    {"Data_pagamento": "2026-01-08", "valor": 6.00, "tipo provento": "RENDIMENTO", "ticker": "LIFE11", "ano": 2026},
    {"Data_pagamento": "2026-02-06", "valor": 6.00, "tipo provento": "RENDIMENTO", "ticker": "LIFE11", "ano": 2026},
    {"Data_pagamento": "2026-03-06", "valor": 6.00, "tipo provento": "RENDIMENTO", "ticker": "LIFE11", "ano": 2026},
    {"Data_pagamento": "2026-02-20", "valor": 14.15, "tipo provento": "JUROS", "ticker": "PETR4", "ano": 2026},
    {"Data_pagamento": "2026-03-20", "valor": 8.89, "tipo provento": "RENDIMENTO", "ticker": "PETR4", "ano": 2026},
    {"Data_pagamento": "2026-01-07", "valor": 4.98, "tipo provento": "RENDIMENTO", "ticker": "VALE3", "ano": 2026},
    {"Data_pagamento": "2026-03-04", "valor": 6.28, "tipo provento": "JUROS", "ticker": "VALE3", "ano": 2026},
    {"Data_pagamento": "2026-01-15", "valor": 5.20, "tipo provento": "RENDIMENTO", "ticker": "DEVA11", "ano": 2026},
    {"Data_pagamento": "2026-02-13", "valor": 3.90, "tipo provento": "RENDIMENTO", "ticker": "DEVA11", "ano": 2026},
    {"Data_pagamento": "2026-03-13", "valor": 3.90, "tipo provento": "RENDIMENTO", "ticker": "DEVA11", "ano": 2026},
    {"Data_pagamento": "2026-01-15", "valor": 5.50, "tipo provento": "RENDIMENTO", "ticker": "FYTO11", "ano": 2026},
    {"Data_pagamento": "2026-02-13", "valor": 5.35, "tipo provento": "RENDIMENTO", "ticker": "FYTO11", "ano": 2026},
    {"Data_pagamento": "2026-03-13", "valor": 4.00, "tipo provento": "RENDIMENTO", "ticker": "FYTO11", "ano": 2026},
    {"Data_pagamento": "2026-01-20", "valor": 2.70, "tipo provento": "RENDIMENTO", "ticker": "CPTS11", "ano": 2026},
    {"Data_pagamento": "2026-02-20", "valor": 2.70, "tipo provento": "RENDIMENTO", "ticker": "CPTS11", "ano": 2026},
    {"Data_pagamento": "2026-03-18", "valor": 2.70, "tipo provento": "RENDIMENTO", "ticker": "CPTS11", "ano": 2026},
    {"Data_pagamento": "2026-01-20", "valor": 2.00, "tipo provento": "RENDIMENTO", "ticker": "MCCI11", "ano": 2026},
    {"Data_pagamento": "2026-02-20", "valor": 2.00, "tipo provento": "RENDIMENTO", "ticker": "MCCI11", "ano": 2026},
    {"Data_pagamento": "2026-03-18", "valor": 2.00, "tipo provento": "RENDIMENTO", "ticker": "MCCI11", "ano": 2026},
]

ok = 0
for i, d in enumerate(dividendos, 1):
    try:
        supabase.table("dividendos").insert({
            "user_id": USER_ID,
            "ano": d["ano"],
            "Data_pagamento": d["Data_pagamento"],
            "ticker": d["ticker"],
            "valor": d["valor"],
            "tipo provento": d["tipo provento"]
        }).execute()
        ok += 1
    except Exception as e:
        print(f"  Erro dividendo {i}: {e}")
print(f"  {ok}/{len(dividendos)} dividendos inseridos com sucesso.")

print("\n" + "=" * 50)
print("  MIGRACAO CONCLUIDA!")
print("=" * 50)