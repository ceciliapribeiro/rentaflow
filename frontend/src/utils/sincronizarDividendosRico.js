import { supabase } from '../lib/supabase'

/**
 * Sincroniza dividendos sem corretora vinculada (corretora_id IS NULL)
 * atribuindo-os automaticamente à corretora 'Rico'.
 * 
 * Isso corrige os dividendos migrados/importados que ficaram sem vínculo
 * (total de R$ 848,49), garantindo que sejam contabilizados na Rico.
 */
export async function sincronizarDividendosRico(userId, corretoras = null) {
  if (!userId) return null

  let lista = corretoras
  if (!lista || lista.length === 0) {
    try {
      const { data: corrs } = await supabase
        .from('corretoras')
        .select('*')
        .eq('user_id', userId)
      lista = corrs || []
    } catch {
      lista = []
    }
  }

  // Localiza a corretora Rico (insensível a maiúsculas/minúsculas)
  const rico = lista.find(c => c.nome?.trim().toLowerCase() === 'rico')
  if (!rico) {
    return null
  }

  try {
    // 1. Busca se existem dividendos sem corretora (corretora_id IS NULL)
    const { data: orfaos, error: errBusca } = await supabase
      .from('dividendos')
      .select('id, valor')
      .eq('user_id', userId)
      .is('corretora_id', null)

    if (errBusca) {
      console.warn('Erro ao verificar dividendos sem corretora:', errBusca)
      return null
    }

    if (orfaos && orfaos.length > 0) {
      const totalValor = orfaos.reduce((s, d) => s + Number(d.valor || 0), 0)
      const ids = orfaos.map(o => o.id)

      // 2. Atualiza no Supabase para vincular à corretora Rico
      const { error: errUpdate } = await supabase
        .from('dividendos')
        .update({ corretora_id: rico.id })
        .in('id', ids)
        .eq('user_id', userId)

      if (errUpdate) {
        console.error('Erro ao atualizar dividendos para a corretora Rico:', errUpdate)
      } else {
        console.log(`[RentaFlow] ✅ ${orfaos.length} dividendos (Total: R$ ${totalValor.toFixed(2)}) vinculados com sucesso à corretora Rico (${rico.id})`)
        return { atualizados: orfaos.length, totalValor, ricoId: rico.id }
      }
    }
  } catch (err) {
    console.error('Falha na sincronização de dividendos com a Rico:', err)
  }

  return null
}
