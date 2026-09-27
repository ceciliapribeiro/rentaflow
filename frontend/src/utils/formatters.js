/**
 * Formata um número como moeda BRL.
 * @param {number} v
 * @returns {string}  Ex: "R$ 1.234,56"
 */
export const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

/**
 * Converte uma data ISO (YYYY-MM-DD) para o formato brasileiro DD/MM/AAAA.
 * @param {string|null} iso
 * @returns {string}  Ex: "27/09/2026"
 */
export const formatData = (iso) => {
  if (!iso) return ''
  const s = String(iso).slice(0, 10)
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}
