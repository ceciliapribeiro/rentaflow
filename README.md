# RentaFlow — Gestão de Dividendos

Sistema de automação para controle de FIIs e ações com foco em renda passiva.

## Módulos

| # | Módulo | Descrição |
|---|--------|-----------|
| 1 | Atualizar Cotações | Preços, DY, P/VP via Yahoo Finance e Status Invest |
| 2 | Importar Notas | Leitura de PDFs de corretagem (Clear/XP) |
| 3 | Buscar Dividendos | Proventos com custódia D+2 automática |
| 4 | Smart Aporte | Boleta de compra/venda inteligente |
| 5 | Relatório de IR | Bens e Direitos + Rendimentos para IRPF |

## Versões

- **v1.0** — Desktop (Tkinter + Excel) — `v1-desktop/`
- **v2.0** — Web SaaS (em desenvolvimento) — `backend/` + `frontend/`

## Tecnologias

**v1.0:** Python, Tkinter, openpyxl, yfinance, pdfplumber, BeautifulSoup

**v2.0:** FastAPI, React, PostgreSQL (Supabase), Tailwind CSS

## Desenvolvido por

Cecília Ribeiro