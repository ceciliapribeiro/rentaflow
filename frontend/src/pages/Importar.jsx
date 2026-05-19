import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import {
  processarOperacoes, processarAportes, processarDividendos,
} from '../utils/importarUtils'
import ImportarPreview from './ImportarPreview'

export default function Importar() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [arquivo, setArquivo] = useState(null)
  const [dados, setDados] = useState({ aportes: [], dividendos: [], operacoes: [] })
  const [preview, setPreview] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [tipoImportacao, setTipoImportacao] = useState('modelo')
  const [abaAtiva, setAbaAtiva] = useState('operacoes')

  const baixarModelo = () => {
    const link = document.createElement('a')
    link.href = '/modelo_carteira.xlsx'
    link.download = 'modelo_carteira.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleArquivo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setErro(null)
    setResultado(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        let aportes = []
        let dividendos = []
        let operacoes = []

        wb.SheetNames.forEach((aba) => {
          const nome = aba.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
          const ws = wb.Sheets[aba]
          const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })

          if (nome.includes('APORTE')) aportes = aportes.concat(processarAportes(jsonData))
          else if (nome.includes('DIVIDENDO') || nome.includes('PROVENTO')) dividendos = dividendos.concat(processarDividendos(jsonData))
          else if (nome.includes('OPERA') || nome.includes('NEGOCIA')) operacoes = operacoes.concat(processarOperacoes(jsonData))
          else operacoes = operacoes.concat(processarOperacoes(jsonData))
        })

        if (aportes.length === 0 && dividendos.length === 0 && operacoes.length === 0) {
          setErro('Nenhum dado encontrado. Verifique se a planilha tem as abas APORTES, DIVIDENDOS e OPERACOES.')
          return
        }

        setDados({ aportes, dividendos, operacoes })
        setPreview(true)
        if (operacoes.length > 0) setAbaAtiva('operacoes')
        else if (aportes.length > 0) setAbaAtiva('aportes')
        else setAbaAtiva('dividendos')
      } catch (err) {
        console.error(err)
        setErro('Erro ao ler o arquivo. Verifique se é um Excel/CSV válido.')
      }
    }
    reader.readAsBinaryString(file)
  }

  const toggleSelecionado = (tipo, index) => {
    setDados(prev => ({
      ...prev,
      [tipo]: prev[tipo].map((item, i) => i === index ? { ...item, selecionado: !item.selecionado } : item)
    }))
  }

  const toggleTodos = (tipo) => {
    setDados(prev => {
      const todos = prev[tipo].every(d => d.selecionado)
      return { ...prev, [tipo]: prev[tipo].map(item => ({ ...item, selecionado: !todos })) }
    })
  }

  const handleImportar = async () => {
    const opsSel = dados.operacoes.filter(d => d.selecionado)
    const apSel = dados.aportes.filter(d => d.selecionado)
    const divSel = dados.dividendos.filter(d => d.selecionado)
    const total = opsSel.length + apSel.length + divSel.length

    if (total === 0) { setErro('Selecione pelo menos um registro.'); return }
    if (!user?.id) { setErro('Usuário não autenticado.'); return }

    setImportando(true)
    setErro(null)

    let sucOps = 0, errOps = 0, sucAp = 0, errAp = 0, sucDiv = 0, errDiv = 0

    const opsOrdenadas = [...opsSel].sort((a, b) => a.data.localeCompare(b.data))

    for (const item of opsOrdenadas) {
      try {
        const { data: cart } = await supabase.from('carteira').select('qtde_ideal')
          .eq('user_id', user.id).eq('ticker', item.ticker).maybeSingle()
        const qtdeAtual = cart ? Number(cart.qtde_ideal) : 0
        const novaQtde = item.operacao === 'COMPRA' ? qtdeAtual + item.quantidade : qtdeAtual - item.quantidade

        await supabase.from('carteira').upsert({
          user_id: user.id, ticker: item.ticker,
          qtde_ideal: Math.max(0, novaQtde), peso_ideal: 0,
        }, { onConflict: 'user_id,ticker' })

        const dadosOp = {
          user_id: user.id,
          data: item.data,
          ticker: item.ticker,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          tipo_ativo: item.tipo_ativo,
          operacao: item.operacao,
          origem: tipoImportacao === 'b3' ? 'importacao_b3' : 'importacao_modelo',
        }

        const { data: dataOp, error: errOp } = await supabase
          .from('operacoes')
          .insert(dadosOp)
          .select()

        if (errOp) {
          console.error(`[OP] ❌ ${item.ticker}:`, errOp.message, errOp.code, errOp.details)
          errOps++
        } else {
          sucOps++
        }
      } catch (err) {
        console.error(`[OP] Exceção ${item.ticker}:`, err.message)
        errOps++
      }
    }

    for (const item of apSel) {
      try {
        const { error } = await supabase.from('aportes').insert({
          user_id: user.id, data: item.data, valor: item.valor, descricao: item.descricao,
        })
        if (error) errAp++
        else sucAp++
      } catch { errAp++ }
    }

    for (const item of divSel) {
      try {
        const { error } = await supabase.from('dividendos').insert({
          user_id: user.id,
          ticker: item.ticker,
          data_pagamento: item.data_pagamento,
          valor: item.valor,
          tipo_provento: item.tipo,
          ano: parseInt(item.data_pagamento.split('-')[0], 10),
        })
        if (error) errDiv++
        else sucDiv++
      } catch { errDiv++ }
    }

    setImportando(false)
    setResultado({
      operacoes: { sucesso: sucOps, erros: errOps, total: opsSel.length },
      aportes: { sucesso: sucAp, erros: errAp, total: apSel.length },
      dividendos: { sucesso: sucDiv, erros: errDiv, total: divSel.length },
    })
  }

  const listaAtiva = dados[abaAtiva] || []
  const selecionadosAba = listaAtiva.filter(d => d.selecionado).length
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Importar Carteira</h1>
            <p className="text-green-200 text-sm">Processa as abas APORTES, DIVIDENDOS e OPERACOES</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!preview && !resultado && (
          <>
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Escolha como importar</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={`border-2 rounded-xl p-6 cursor-pointer transition ${tipoImportacao === 'modelo' ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-green-400'}`}
                  onClick={() => setTipoImportacao('modelo')}
                >
                  <FileSpreadsheet className="text-green-600 mb-3" size={32} />
                  <h3 className="font-semibold text-gray-800 mb-2">Planilha Modelo</h3>
                  <p className="text-gray-600 text-sm mb-4">
                    Planilha com 3 abas: <strong>APORTES</strong>, <strong>DIVIDENDOS</strong> e <strong>OPERACOES</strong>.
                  </p>
                  <button onClick={(e) => { e.stopPropagation(); baixarModelo() }}
                    className="flex items-center gap-2 text-green-700 font-medium text-sm hover:text-green-800">
                    <Download size={16} /> Baixar Planilha Modelo
                  </button>
                </div>

                <div
                  className={`border-2 rounded-xl p-6 cursor-pointer transition ${tipoImportacao === 'b3' ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-green-400'}`}
                  onClick={() => setTipoImportacao('b3')}
                >
                  <FileSpreadsheet className="text-blue-600 mb-3" size={32} />
                  <h3 className="font-semibold text-gray-800 mb-2">Arquivo da B3</h3>
                  <p className="text-gray-600 text-sm mb-4">Exporte sua carteira da Área do Investidor B3.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-8">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-green-500 transition cursor-pointer"
                onClick={() => document.getElementById('fileInput').click()}>
                <Upload className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 font-medium">Clique para selecionar o arquivo</p>
                <p className="text-gray-400 text-sm mt-1">Aceita XLS, XLSX ou CSV</p>
                <input id="fileInput" type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleArquivo} />
              </div>
              {arquivo && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                  <FileSpreadsheet size={16} className="text-green-600" />
                  <span>{arquivo.name}</span>
                </div>
              )}
            </div>
          </>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="text-red-500" size={20} />
            <p className="text-red-700 text-sm">{erro}</p>
          </div>
        )}

        {preview && !resultado && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <div className="flex gap-2 border-b mb-4">
              {['operacoes', 'aportes', 'dividendos'].map(k => (
                <button key={k} onClick={() => setAbaAtiva(k)}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition ${abaAtiva === k ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {k === 'operacoes' ? 'Operações' : k === 'aportes' ? 'Aportes' : 'Dividendos'} ({dados[k].length})
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600">
                <strong>{selecionadosAba}</strong> de <strong>{listaAtiva.length}</strong> selecionados
                <button onClick={() => toggleTodos(abaAtiva)} className="ml-4 text-green-700 hover:text-green-800 underline">
                  {listaAtiva.every(d => d.selecionado) ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPreview(false); setDados({ aportes: [], dividendos: [], operacoes: [] }); setArquivo(null) }}
                  className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button onClick={handleImportar} disabled={importando}
                  className="px-6 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
                  {importando ? 'Importando...' : 'Confirmar importação'}
                </button>
              </div>
            </div>

            <ImportarPreview dados={dados} abaAtiva={abaAtiva} toggleSelecionado={toggleSelecionado} />
          </div>
        )}

        {resultado && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Importação concluída!</h2>
            <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-6">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Operações</p>
                <p className="text-xl font-bold text-green-700">{resultado.operacoes.sucesso}/{resultado.operacoes.total}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Aportes</p>
                <p className="text-xl font-bold text-blue-700">{resultado.aportes.sucesso}/{resultado.aportes.total}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Dividendos</p>
                <p className="text-xl font-bold text-emerald-700">{resultado.dividendos.sucesso}/{resultado.dividendos.total}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/dashboard')}
                className="px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600">Ir para o Dashboard</button>
              <button onClick={() => { setResultado(null); setPreview(false); setDados({ aportes: [], dividendos: [], operacoes: [] }); setArquivo(null) }}
                className="px-6 py-2 border text-gray-600 rounded-lg hover:bg-gray-50">Importar outro arquivo</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
