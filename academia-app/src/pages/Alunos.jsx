import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateBR, formatCPF, maskCPF, maskWhats, moeda, onlyDigits, ontemISO, validarCPF } from '../lib/format'

const vazio = { nome: '', cpf: '', whatsapp: '', email: '', valor: '' }

function parseValor(v) {
  return Number(String(v).replace(/\./g, '').replace(',', '.'))
}

export default function Alunos() {
  const [alunos, setAlunos] = useState([])
  const [form, setForm] = useState(vazio)
  const [formAberto, setFormAberto] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const [cobranca, setCobranca] = useState(null)

  async function carregar() {
    const { data, error } = await supabase.from('alunos_situacao').select('*').order('nome')
    if (error) setMsg({ tipo: 'erro', texto: error.message })
    else setAlunos(data)
  }

  useEffect(() => {
    carregar()
  }, [])

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    const digitos = onlyDigits(q)
    return alunos.filter((a) => {
      if (filtro === 'em_dia' && !a.em_dia) return false
      if (filtro === 'pendentes' && a.em_dia) return false
      if (!termo) return true
      return a.nome.toLowerCase().includes(termo) || (digitos && a.cpf.includes(digitos))
    })
  }, [alunos, filtro, q])

  async function salvar(e) {
    e.preventDefault()
    setMsg(null)
    const valor = parseValor(form.valor)
    if (form.nome.trim().length < 2) return setMsg({ tipo: 'erro', texto: 'Informe o nome.' })
    if (!validarCPF(form.cpf)) return setMsg({ tipo: 'erro', texto: 'CPF inválido.' })
    if (!(valor > 0)) return setMsg({ tipo: 'erro', texto: 'Informe o valor da mensalidade.' })

    // Aluno novo nasce BLOQUEADO (vencimento = ontem) até o 1º pagamento.
    const { error } = await supabase.from('alunos').insert({
      nome: form.nome.trim(),
      cpf: onlyDigits(form.cpf),
      whatsapp: onlyDigits(form.whatsapp) || null,
      email: form.email.trim() || null,
      valor_mensalidade: valor,
      vencimento: ontemISO(),
    })
    if (error) {
      setMsg({ tipo: 'erro', texto: error.code === '23505' ? 'Já existe aluno com esse CPF.' : error.message })
      return
    }
    setForm(vazio)
    setFormAberto(false)
    setMsg({ tipo: 'ok', texto: 'Aluno cadastrado. Gere a primeira cobrança para liberar o acesso.' })
    carregar()
  }

  async function cobrar(a, metodo) {
    setBusy(a.id + metodo)
    setMsg(null)
    const { data, error } = await supabase.functions.invoke('criar-cobranca', {
      body: { aluno_id: a.id, metodo },
    })
    setBusy('')
    if (error) {
      let texto = error.message
      try {
        const j = await error.context.json()
        if (j?.error) texto = j.error
      } catch {
        /* mantém a mensagem genérica */
      }
      setMsg({ tipo: 'erro', texto })
      return
    }
    setCobranca({ aluno: a, ...data })
  }

  async function pagoManual(a) {
    if (!window.confirm(`Confirmar recebimento de ${moeda(a.valor_mensalidade)} em dinheiro de ${a.nome}?`)) return
    const { error } = await supabase.rpc('registrar_pagamento_manual', { p_aluno: a.id })
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    setMsg({ tipo: 'ok', texto: `Pagamento de ${a.nome} registrado.` })
    carregar()
  }

  async function alternarStatus(a) {
    const novo = a.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('alunos').update({ status: novo }).eq('id', a.id)
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    carregar()
  }

  const copiar = (texto) => navigator.clipboard?.writeText(texto)

  return (
    <div>
      <div className="row-between">
        <h1 className="page-title">Alunos</h1>
        <button className="btn" onClick={() => setFormAberto((v) => !v)}>
          {formAberto ? 'Fechar' : '+ Novo aluno'}
        </button>
      </div>

      {msg && <p className={`alert ${msg.tipo === 'ok' ? 'alert-ok' : 'alert-erro'}`}>{msg.texto}</p>}

      {formAberto && (
        <form className="card" onSubmit={salvar}>
          <div className="grid-2">
            <label className="field"><span>Nome completo *</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
            <label className="field"><span>CPF *</span>
              <input value={form.cpf} inputMode="numeric" onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} /></label>
            <label className="field"><span>WhatsApp</span>
              <input value={form.whatsapp} inputMode="tel" onChange={(e) => setForm({ ...form, whatsapp: maskWhats(e.target.value) })} /></label>
            <label className="field"><span>E-mail (necessário p/ cobrança)</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field"><span>Mensalidade (R$) *</span>
              <input value={form.valor} inputMode="decimal" placeholder="99,90" onChange={(e) => setForm({ ...form, valor: e.target.value })} /></label>
          </div>
          <button className="btn">Salvar aluno</button>
        </form>
      )}

      <div className="toolbar">
        <input placeholder="Buscar por nome ou CPF" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {[['todos', 'Todos'], ['em_dia', 'Em dia'], ['pendentes', 'Pendentes']].map(([v, t]) => (
            <button key={v} className={filtro === v ? 'on' : ''} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="lista">
        {lista.length === 0 && <p className="muted">Nenhum aluno encontrado.</p>}
        {lista.map((a) => (
          <div key={a.id} className="card aluno">
            <div className="aluno-topo">
              <div>
                <strong>{a.nome}</strong>
                <div className="muted">CPF {formatCPF(a.cpf)} · {moeda(a.valor_mensalidade)}/mês</div>
              </div>
              <span className={`badge ${a.em_dia ? 'badge-ok' : 'badge-bloq'}`}>
                {a.status !== 'ativo' ? 'Inativo' : a.em_dia ? `Em dia até ${dateBR(a.vencimento)}` : `Vencido ${dateBR(a.vencimento)}`}
              </span>
            </div>
            <div className="acoes">
              <button className="btn-sm" disabled={busy === a.id + 'pix'} onClick={() => cobrar(a, 'pix')}>
                {busy === a.id + 'pix' ? 'Gerando…' : 'Cobrar Pix'}
              </button>
              <button className="btn-sm" disabled={busy === a.id + 'cartao'} onClick={() => cobrar(a, 'cartao')}>
                {busy === a.id + 'cartao' ? 'Gerando…' : 'Assinatura cartão'}
              </button>
              <button className="btn-sm" onClick={() => pagoManual(a)}>Pago em dinheiro</button>
              <button className="btn-sm btn-sm-ghost" onClick={() => alternarStatus(a)}>
                {a.status === 'ativo' ? 'Inativar' : 'Reativar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {cobranca && (
        <div className="modal" onClick={() => setCobranca(null)}>
          <div className="card modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>{cobranca.metodo === 'pix' ? 'Pix gerado' : 'Link da assinatura'}</h2>
            <p className="muted">{cobranca.aluno.nome} · {moeda(cobranca.aluno.valor_mensalidade)}</p>

            {cobranca.metodo === 'pix' ? (
              <>
                {cobranca.qr_code_base64 && (
                  <img className="qr" alt="QR Code Pix" src={`data:image/png;base64,${cobranca.qr_code_base64}`} />
                )}
                <label className="field"><span>Pix copia e cola</span>
                  <textarea readOnly rows={4} value={cobranca.qr_code || ''} /></label>
                <button className="btn" onClick={() => copiar(cobranca.qr_code)}>Copiar código Pix</button>
              </>
            ) : (
              <>
                <p>Envie este link ao aluno. Ele cadastra o cartão uma vez e as mensalidades passam a ser cobradas automaticamente.</p>
                <label className="field"><span>Link</span>
                  <textarea readOnly rows={3} value={cobranca.init_point || ''} /></label>
                <button className="btn" onClick={() => copiar(cobranca.init_point)}>Copiar link</button>
              </>
            )}
            <button className="btn-ghost" onClick={() => { setCobranca(null); carregar() }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
