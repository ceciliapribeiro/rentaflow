import { formatBRL, formatData } from '../utils/importarUtils'

export default function ImportarPreview({ dados, abaAtiva, toggleSelecionado }) {
  return (
    <div className="overflow-x-auto">
      {abaAtiva === 'operacoes' && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 px-3 w-10"></th>
              <th className="py-2 px-3">Data</th>
              <th className="py-2 px-3">Ticker</th>
              <th className="py-2 px-3">Operação</th>
              <th className="py-2 px-3 text-right">Quantidade</th>
              <th className="py-2 px-3 text-right">Preço</th>
              <th className="py-2 px-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {dados.operacoes.map((item, i) => (
              <tr key={i} className={`border-b hover:bg-gray-50 ${!item.selecionado ? 'opacity-40' : ''}`}>
                <td className="py-2 px-3">
                  <input type="checkbox" checked={item.selecionado}
                    onChange={() => toggleSelecionado('operacoes', i)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                </td>
                <td className="py-2 px-3">{formatData(item.data)}</td>
                <td className="py-2 px-3 font-medium text-gray-800">{item.ticker}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.operacao === 'VENDA' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {item.operacao}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">{item.quantidade}</td>
                <td className="py-2 px-3 text-right">{formatBRL(item.preco_unitario)}</td>
                <td className="py-2 px-3 text-right font-medium">{formatBRL(item.quantidade * item.preco_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {abaAtiva === 'aportes' && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 px-3 w-10"></th>
              <th className="py-2 px-3">Data</th>
              <th className="py-2 px-3 text-right">Valor</th>
              <th className="py-2 px-3">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {dados.aportes.map((item, i) => (
              <tr key={i} className={`border-b hover:bg-gray-50 ${!item.selecionado ? 'opacity-40' : ''}`}>
                <td className="py-2 px-3">
                  <input type="checkbox" checked={item.selecionado}
                    onChange={() => toggleSelecionado('aportes', i)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                </td>
                <td className="py-2 px-3">{formatData(item.data)}</td>
                <td className="py-2 px-3 text-right font-medium">{formatBRL(item.valor)}</td>
                <td className="py-2 px-3 text-gray-600">{item.descricao || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {abaAtiva === 'dividendos' && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 px-3 w-10"></th>
              <th className="py-2 px-3">Data Pgto</th>
              <th className="py-2 px-3">Ticker</th>
              <th className="py-2 px-3">Tipo</th>
              <th className="py-2 px-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {dados.dividendos.map((item, i) => (
              <tr key={i} className={`border-b hover:bg-gray-50 ${!item.selecionado ? 'opacity-40' : ''}`}>
                <td className="py-2 px-3">
                  <input type="checkbox" checked={item.selecionado}
                    onChange={() => toggleSelecionado('dividendos', i)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                </td>
                <td className="py-2 px-3">{formatData(item.data_pagamento)}</td>
                <td className="py-2 px-3 font-medium text-gray-800">{item.ticker}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.tipo === 'JUROS' ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {item.tipo}
                  </span>
                </td>
                <td className="py-2 px-3 text-right font-medium">{formatBRL(item.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
