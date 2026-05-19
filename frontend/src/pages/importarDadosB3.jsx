import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, Database, CheckCircle,
  AlertCircle, ArrowLeft, BarChart3
} from 'lucide-react'
import { processarDadosB3 } from '../utils/importarDadosB3'

export default function ImportarDadosB3() {
  const navigate = useNavigate()

  const [arquivo, setArquivo] = useState(null)
  const [dadosProcessados, setDadosProcessados] = useState(null)
  const [statsBruto, setStatsBruto] = useState(null)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)

  const handleArquivo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setErro(null)
    setResultado(null)
    setDadosProcessados(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })

        const abaB3 = wb.SheetNames.find(n => {
          const norm = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
          return norm.includes('dados b3') || norm === 'dados b3' || norm.includes('dadosb3')
        })

        if (!abaB3) {
          setErro(`Aba "Dados B3" não encontrada. Abas detectadas: ${wb.SheetNames.join(', ')}`)
          return
        }

        const ws = wb.Sheets[abaB3]
        const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })

        if (jsonData.length === 0) {
          setErro('A aba "Dados B3" está vazia.')
          return
        }

        const { dados, stats } = processarDadosB3(jsonData)

        if (dados.length === 0) {
          setErro('Nenhum ativo válido encontrado na aba "Dados B3".')
          return
        }

        setDadosProcessados(dados)
        setStatsBruto(stats)
      } catch (err) {
        console.error(err)
        setErro('Erro ao ler o arquivo: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleImportar = async () => {
    if (!dadosProcessados || dadosProcessados.length === 0) return

    setImportando(true)
    setErro(null)
    setProgresso({ atual: 0, total: dadosProcessados.length })

    let sucesso = 0
    let erros = 0
    const errosDetalhe = []

    const LOTE = 100
    for (let i = 0; i < dadosProcessados.length; i += LOTE) {
      const lote = dadosProcessados.slice(i, i + LOTE)

      const loteLimpo = lote.map(item => {
        const obj = { ticker: item.ticker, tipo: item.tipo }
        if (item.razao_social) obj.razao_social = item.razao_social
        if (item.preco !== null && item.preco !== undefined) obj.preco = item.preco
        if (item.cnpj) obj.cnpj = item.cnpj
        if (item.segmento) obj.segmento = item.segmento
        if (item.dy !== null && item.dy !== undefined) obj.dy = item.dy
        if (item.pvp !== null && item.pvp !== undefined) obj.pvp = item.pvp
        if (item.short_name) obj.short_name = item.short_name
        return obj
      })

      try {
        const { error } = await supabase
          .from('ativos')
          .upsert(loteLimpo, { onConflict: 'ticker' })

        if (error) {
          erros += lote.length
          errosDetalhe.push(`Lote ${i}: ${error.message}`)
          console.error('Erro lote:', error)
        } else {
          sucesso += lote.length
        }
      } catch (err) {
        erros += lote.length
        errosDetalhe.push(`Lote ${i}: ${err.message}`)
      }

      setProgresso({ atual: Math.min(i + LOTE, dadosProcessados.length), total: dadosProcessados.length })
    }

    setImportando(false)
    setResultado({ sucesso, erros, errosDetalhe })
  }

  const stats = dadosProcessados ? {
    total: dadosProcessados.length,
    fii: dadosProcessados.filter(d => d.tipo === 'FII').length,
    acao: dadosProcessados.filter(d => d.tipo === 'Acao').length,
    bdr: dadosProcessados.filter(d => d.tipo === 'BDR').length,
    comDY: dadosProcessados.filter(d => d.dy && d.dy > 0).length,
    comPvp: dadosProcessados.filter(d => d.pvp && d.pvp > 0).length,
    comCNPJ: dadosProcessados.filter(d => d.cnpj).length,
    comRazaoSocial: dadosProcessados.filter(d => d.razao_social).length,
    comShortName: dadosProcessados.filter(d => d.short_name).length,
    comPreco: dadosProcessados.filter(d => d.preco && d.preco > 0).length,
  } : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Importar Catálogo de Ativos B3</h1>
            <p className="text-green-200 text-sm">Importa a aba "Dados B3" da planilha mestre</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!arquivo && !resultado && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <div className="flex items-start gap-4">
              <Database className="text-green-600 flex-shrink-0" size={32} />
              <div>
                <h2 className="text-lg font-semibold text-gray-700 mb-2">O que essa importação faz?</h2>
                <p className="text-gray-600 text-sm mb-3">
                  Importa o <strong>catálogo completo de ativos da B3</strong> (1500+ tickers) com
                  razão social, CNPJ, segmento e Short Name oficial.
                </p>
                <p className="text-gray-600 text-sm mb-3">
                  Os <strong>preços, DY e P/VP</strong> também serão importados, mas serão atualizados
                  periodicamente pela Edge Function "Atualizar Cotações".
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3 text-sm text-blue-800">
                  <strong>💡 Dica:</strong> Você só precisa fazer essa importação <strong>uma vez</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {!dadosProcessados && !resultado && (
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-green-500 transition cursor-pointer"
              onClick={() => document.getElementById('fileB3').click()}
            >
              <Upload className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600 font-medium">Clique para selecionar a planilha mestre</p>
              <p className="text-gray-400 text-sm mt-1">RentaFlow_Planilha_CLIENTE.xlsx</p>
              <input id="fileB3" type="file" accept=".xls,.xlsx" className="hidden" onChange={handleArquivo} />
            </div>
            {arquivo && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <FileSpreadsheet size={16} className="text-green-600" />
                <span>{arquivo.name}</span>
              </div>
            )}
          </div>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
            <div className="text-red-700 text-sm">{erro}</div>
          </div>
        )}

        {dadosProcessados && !resultado && stats && (
          <>
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-700">Preview da Importação</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <BarChart3 size={16} />
                  {statsBruto?.total} linhas lidas → {stats.total} aceitas
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard label="Total" valor={stats.total} cor="text-gray-800" />
                <StatCard label="FIIs" valor={stats.fii} cor="text-purple-600" />
                <StatCard label="Ações" valor={stats.acao} cor="text-blue-600" />
                <StatCard label="BDRs" valor={stats.bdr} cor="text-orange-600" />
              </div>

              <h3 className="text-sm font-medium text-gray-500 mb-2">Completude dos dados:</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                <Completude label="Razão Social" qtde={stats.comRazaoSocial} total={stats.total} />
                <Completude label="CNPJ" qtde={stats.comCNPJ} total={stats.total} />
                <Completude label="Preço" qtde={stats.comPreco} total={stats.total} />
                <Completude label="DY" qtde={stats.comDY} total={stats.total} />
                <Completude label="P/VP" qtde={stats.comPvp} total={stats.total} />
                <Completude label="Short Name" qtde={stats.comShortName} total={stats.total} />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                <strong>⚠ Atenção:</strong> os dados existentes na tabela <code>ativos</code> serão sobrescritos.
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setArquivo(null); setDadosProcessados(null); setStatsBruto(null) }}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImportar}
                  disabled={importando}
                  className="px-6 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {importando
                    ? `Importando... ${progresso?.atual || 0}/${progresso?.total || 0}`
                    : `Importar ${stats.total} ativos`}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Primeiros 20 ativos (preview):</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b text-gray-500">
                    <tr>
                      <th className="py-2 px-2 text-left">Ticker</th>
                      <th className="py-2 px-2 text-left">Tipo</th>
                      <th className="py-2 px-2 text-left">Razão Social</th>
                      <th className="py-2 px-2 text-right">Preço</th>
                      <th className="py-2 px-2 text-right">DY</th>
                      <th className="py-2 px-2 text-right">P/VP</th>
                      <th className="py-2 px-2 text-left">CNPJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosProcessados.slice(0, 20).map((d, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-medium">{d.ticker}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            d.tipo === 'FII' ? 'bg-purple-100 text-purple-700' :
                            d.tipo === 'BDR' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{d.tipo}</span>
                        </td>
                        <td className="py-1.5 px-2 truncate max-w-[200px]">{d.razao_social || '—'}</td>
                        <td className="py-1.5 px-2 text-right">{d.preco ? `R$ ${d.preco.toFixed(2)}` : '—'}</td>
                        <td className="py-1.5 px-2 text-right">{d.dy ? `${d.dy.toFixed(2)}%` : '—'}</td>
                        <td className="py-1.5 px-2 text-right">{d.pvp ? d.pvp.toFixed(2) : '—'}</td>
                        <td className="py-1.5 px-2 text-gray-500">{d.cnpj || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {resultado && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Importação concluída!</h2>
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-6">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Sucesso</p>
                <p className="text-2xl font-bold text-green-700">{resultado.sucesso}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Erros</p>
                <p className="text-2xl font-bold text-red-700">{resultado.erros}</p>
              </div>
            </div>

            {resultado.errosDetalhe.length > 0 && (
              <details className="text-left bg-red-50 rounded-lg p-3 mb-4 max-w-md mx-auto">
                <summary className="cursor-pointer text-sm text-red-700 font-medium">
                  Ver detalhes dos erros
                </summary>
                <ul className="mt-2 text-xs text-red-600 space-y-1">
                  {resultado.errosDetalhe.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600">
                Ir para o Dashboard
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, valor, cor }) {
  return (
    <div
