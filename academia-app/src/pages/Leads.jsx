import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateBR, maskWhats } from '../lib/format'

const STATUS = [
  ['novo', 'Novo'],
  ['contatado', 'Contatado'],
  ['confirmado', 'Confirmado'],
  ['compareceu', 'Compareceu'],
]
const PERIODO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [erro, setErro] = useState('')

  async function carregar() {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (error) setErro(error.message)
    else setLeads(data)
  }

  useEffect(() => {
    carregar()
  }, [])

  const contagem = useMemo(() => {
    const c = { todos: leads.length }
    STATUS.forEach(([v]) => (c[v] = leads.filter((l) => l.status === v).length))
    return c
  }, [leads])

  const lista = filtro === 'todos' ? leads : leads.filter((l) => l.status === filtro)

  async function mudarStatus(id, status) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)))
    const { error } = await supabase.from('leads').update({ status }).eq('id', id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  function exportarCSV() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const linhas = [
      ['Nome', 'WhatsApp', 'E-mail', 'Dia preferido', 'Período', 'Objetivo', 'Status', 'Cadastrado em'],
      ...lista.map((l) => [
        l.nome, l.whatsapp, l.email, dateBR(l.dia_preferido), PERIODO[l.periodo] || '', l.objetivo, l.status,
        new Date(l.created_at).toLocaleString('pt-BR'),
      ]),
    ]
    const csv = '﻿' + linhas.map((r) => r.map(esc).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="row-between">
        <h1 className="page-title">Leads do pré-agendamento</h1>
        <button className="btn" onClick={exportarCSV}>Exportar CSV</button>
      </div>

      {erro && <p className="alert alert-erro">{erro}</p>}

      <div className="seg seg-wrap">
        {[['todos', 'Todos'], ...STATUS].map(([v, t]) => (
          <button key={v} className={filtro === v ? 'on' : ''} onClick={() => setFiltro(v)}>
            {t} ({contagem[v] ?? 0})
          </button>
        ))}
      </div>

      <div className="lista">
        {lista.length === 0 && <p className="muted">Nenhum lead nesta categoria.</p>}
        {lista.map((l) => (
          <div key={l.id} className="card aluno">
            <div className="aluno-topo">
              <div>
                <strong>{l.nome}</strong>
                <div className="muted">
                  {maskWhats(l.whatsapp)}
                  {l.dia_preferido ? ` · ${dateBR(l.dia_preferido)}` : ''}
                  {l.periodo ? ` · ${PERIODO[l.periodo]}` : ''}
                  {l.objetivo ? ` · ${l.objetivo}` : ''}
                </div>
              </div>
              <select value={l.status} onChange={(e) => mudarStatus(l.id, e.target.value)}>
                {STATUS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div className="acoes">
              <a className="btn-sm" target="_blank" rel="noreferrer"
                 href={`https://wa.me/55${l.whatsapp}?text=${encodeURIComponent(`Olá, ${l.nome.split(' ')[0]}! Recebemos seu pré-agendamento. Podemos confirmar sua visita?`)}`}>
                Chamar no WhatsApp
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
