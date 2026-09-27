/**
 * Calcula a posição atual (quantidade e custo total) de cada ticker
 * a partir do histórico de operações, usando custo médio ponderado.
 *
 * Regras:
 *  - COMPRA: acumula quantidade e custo
 *  - VENDA: abate quantidade e custo proporcionalmente (preço médio atual)
 *  - Posições residuais <= 0.0001 cota são zeradas (evita lixo de ponto flutuante)
 *
 * @param {Array<{ticker: string, quantidade: string|number, preco_unitario: string|number, operacao: string}>} operacoes
 * @returns {Record<string, {qtde: number, custo: number}>}
 *   Mapa de ticker → { qtde, custo }
 *   O preço médio é custo / qtde (quando qtde > 0).
 */
export function calcularPosicoes(operacoes) {
  const pos = {}

  for (const op of operacoes) {
    const t = op.ticker
    const q = Number(op.quantidade) || 0
    const p = Number(op.preco_unitario) || 0
    const tipoOp = (op.operacao || '').toUpperCase()

    if (!pos[t]) pos[t] = { qtde: 0, custo: 0 }

    if (tipoOp === 'COMPRA') {
      pos[t].qtde += q
      pos[t].custo += q * p
    } else if (tipoOp === 'VENDA') {
      const pm = pos[t].qtde > 0 ? pos[t].custo / pos[t].qtde : 0
      pos[t].qtde -= q
      pos[t].custo -= q * pm
      if (pos[t].qtde <= 0.0001) {
        pos[t].qtde = 0
        pos[t].custo = 0
      }
    }
  }

  return pos
}

/**
 * Retorna somente os tickers com posição aberta (qtde > 0).
 * @param {ReturnType<calcularPosicoes>} posicoes
 * @returns {string[]}
 */
export function tickersAtivos(posicoes) {
  return Object.keys(posicoes).filter(t => posicoes[t].qtde > 0)
}

/**
 * Infere o tipo de ativo pelo ticker quando o campo `tipo` do banco é nulo.
 * Regra heurística: termina com "11" e tem >= 5 chars → FII; senão → Acao.
 * @param {string} ticker
 * @param {string|null|undefined} tipoDosBanco
 * @returns {string}
 */
export function inferirTipo(ticker, tipoDosBanco) {
  if (tipoDosBanco) return tipoDosBanco
  return ticker.endsWith('11') && ticker.length >= 5 ? 'FII' : 'Acao'
}
