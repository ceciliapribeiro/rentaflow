import { supabase } from '../lib/supabase'
import { avaliarDividendosCorretora } from './avaliarDividendosCorretora'

/**
 * Avalia e sincroniza dividendos com base nas datas das operações e custódia real por corretora.
 */
export async function sincronizarDividendosRico(userId, corretoras = null) {
  if (!userId) return null

  try {
    let listaCorrs = corretoras
    if (!listaCorrs || listaCorrs.length === 0) {
      const { data: corrs } = await supabase.from('corretoras').select('*').eq('user_id', userId)
      listaCorrs = corrs || []
    }

    const [divsRaw, opsRaw] = await Promise.all([
      supabase.from('dividendos').select('id, valor, data_pagamento, data_ex, ticker, corretora_id, quantidade').eq('user_id', userId),
      supabase.from('operacoes').select('ticker, data, quantidade, operacao, corretora_id').eq('user_id', userId),
    ])

    const { divergencias, salvarNoBanco } = avaliarDividendosCorretora(
      divsRaw.data || [],
      opsRaw.data || [],
      listaCorrs
    )

    if (divergencias.length > 0) {
      return await salvarNoBanco()
    }
  } catch (err) {
    console.warn('Erro ao avaliar dividendos por custódia:', err)
  }

  return null
}
