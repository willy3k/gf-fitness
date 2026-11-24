import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateBR, formatCPF, onlyDigits } from '../lib/format'

function motivo(a) {
  if (a.status !== 'ativo') return 'Cadastro inativo'
  return `Mensalidade vencida em ${dateBR(a.vencimento)}`
}

export default function Recepcao() {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [registrados, setRegistrados] = useState({})

  async function buscar(e) {
    e.preventDefault()
    const termo = busca.trim()
    if (!termo) return
    setLoading(true)
    setErro('')
    setRegistrados({})

    const digitos = onlyDigits(termo)
    let q = supabase.from('alunos_situacao').select('*').order('nome').limit(10)
    q = digitos.length === 11 ? q.eq('cpf', digitos) : q.ilike('nome', `%${termo.replace(/[%_]/g, '')}%`)

    const { data, error } = await q
    setLoading(false)
    if (error) {
      setErro('Erro na consulta: ' + error.message)
      return
    }
    setResultados(data)
  }

  async function registrarEntrada(a) {
    const { error } = await supabase.from('acessos').insert({ aluno_id: a.id, liberado: a.em_dia })
    if (error) {
      setErro('Não foi possível registrar a entrada: ' + error.message)
      return
    }
    setRegistrados((r) => ({ ...r, [a.id]: true }))
  }

  return (
    <div>
      <h1 className="page-title">Recepção</h1>
      <p className="muted">Digite o CPF ou o nome do aluno para conferir se a entrada está liberada.</p>

      <form className="busca" onSubmit={buscar}>
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="CPF (só números) ou nome"
          inputMode="search"
        />
        <button className="btn" disabled={loading}>{loading ? '…' : 'Consultar'}</button>
      </form>

      {erro && <p className="alert alert-erro">{erro}</p>}

      {resultados && resultados.length === 0 && (
        <div className="status status-bloq">
          <strong>NÃO CADASTRADO</strong>
          <span>Nenhum aluno encontrado. Entrada não liberada.</span>
        </div>
      )}

      {resultados?.map((a) => (
        <div key={a.id} className={`status ${a.em_dia ? 'status-ok' : 'status-bloq'}`}>
          <strong>{a.em_dia ? 'LIBERADO' : 'BLOQUEADO'}</strong>
          <span className="nome">{a.nome}</span>
          <span>CPF {formatCPF(a.cpf)}</span>
          <span>{a.em_dia ? `Em dia até ${dateBR(a.vencimento)}` : motivo(a)}</span>
          {a.em_dia ? (
            <button
              className="btn btn-light"
              disabled={registrados[a.id]}
              onClick={() => registrarEntrada(a)}
            >
              {registrados[a.id] ? 'Entrada registrada ✓' : 'Registrar entrada'}
            </button>
          ) : (
            <span className="dica">Oriente o aluno a regularizar a mensalidade antes de liberar.</span>
          )}
        </div>
      ))}
    </div>
  )
}
