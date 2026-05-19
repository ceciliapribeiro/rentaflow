# RentaFlow v2.0 — Gestão de Renda Passiva

Sistema web para controle de investimentos em FIIs, ações e BDRs com foco em renda passiva.

## 🚀 Stack

- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Cotações:** Yahoo Finance (via Edge Function em Deno)
- **Catálogo:** B3 (importação via Excel)

## 📋 Módulos

| # | Módulo | Status |
|---|---|---|
| ✅ | Importação de carteira (Operações/Aportes/Dividendos) | Pronto |
| ✅ | Catálogo B3 (1500+ ativos) | Pronto |
| ✅ | Dashboard com Patrimônio/DY/P/VP | Pronto |
| ✅ | Atualização de Cotações (Yahoo Finance) | Pronto |
| ⏳ | Importar Notas PDF | Em desenvolvimento |
| ⏳ | Buscar Dividendos (Fundamentus) | Em desenvolvimento |
| ⏳ | Smart Aporte | Em desenvolvimento |
| ⏳ | Relatório de IR | Em desenvolvimento |

## 🛠 Como rodar localmente

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/rentaflow.git
cd rentaflow/frontend

Desenvolvido por Cecília Ribeiro