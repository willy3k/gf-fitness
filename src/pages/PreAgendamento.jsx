import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateBR, hojeISO, maskWhats, onlyDigits } from '../lib/format'
import logo from '../assets/logo.png'

const NOME = import.meta.env.VITE_NOME_ACADEMIA || 'GF Fitness'
const ABERTURA = import.meta.env.VITE_DATA_ABERTURA || ''

const OBJETIVOS = ['Emagrecer', 'Ganhar massa', 'Condicionamento', 'Saúde e bem-estar', 'Reabilitação', 'Outro']
const PERIODOS = [
  { v: 'manha', t: 'Manhã' },
  { v: 'tarde', t: 'Tarde' },
  { v: 'noite', t: 'Noite' },
]

const inicial = {
  nome: '',
  whatsapp: '',
  email: '',
  dia: '',
  periodo: 'manha',
  objetivo: OBJETIVOS[0],
  consentimento: false,
  empresa: '', // honeypot anti-robô: humanos não preenchem
}

export default function PreAgendamento() {
  const [f, setF] = useState(inicial)
  const [estado, setEstado] = useState('idle') // idle | enviando | ok
  const [erro, setErro] = useState('')

  const set = (campo) => (e) =>
    setF((s) => ({ ...s, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function enviar(e) {
    e.preventDefault()
    setErro('')

    if (f.empresa) {
      setEstado('ok') // robô: finge sucesso e descarta
      return
    }
    const zap = onlyDigits(f.whatsapp)
    if (f.nome.trim().length < 2) return setErro('Informe seu nome.')
    if (zap.length < 10) return setErro('Informe um WhatsApp válido com DDD.')
    if (!f.consentimento) return setErro('Precisamos do seu consentimento para entrar em contato.')

    setEstado('enviando')
    const { error } = await supabase.from('leads').insert({
      nome: f.nome.trim(),
      whatsapp: zap,
      email: f.email.trim() || null,
      dia_preferido: f.dia || null,
      periodo: f.periodo,
      objetivo: f.objetivo,
      consentimento: true,
    })

    if (error) {
      setEstado('idle')
      console.error('Erro ao salvar lead:', error)
      if (error.code === '23505') {
        setEstado('ok') // WhatsApp já cadastrado: mesma mensagem de sucesso
        return
      }
      const detalhe = [error.code, error.message].filter(Boolean).join(' - ')
      setErro(
        detalhe
          ? `Não foi possível enviar agora. Tente novamente em instantes. (${detalhe})`
          : 'Não foi possível enviar agora. Tente novamente em instantes.',
      )
      return
    }
    setEstado('ok')
  }

  return (
    <div className="landing">
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="tag">Pré-abertura</span>
            <h1>{NOME}</h1>
            <p className="lead">
              Garanta seu lugar na inauguração{ABERTURA ? <> em <strong>{dateBR(ABERTURA)}</strong></> : null}.
              Agende sua visita, conheça a estrutura e aproveite condições exclusivas de pré-abertura.
            </p>
            <a href="#agendar" className="btn">Quero agendar minha visita</a>
          </div>
          <img className="hero-logo" src={logo} alt={`Logo ${NOME}`} width="260" height="260" />
        </div>
      </section>

      <section className="container beneficios">
        <div className="card"><h3>Equipamentos novos</h3><p className="muted">Musculação e funcional com estrutura completa.</p></div>
        <div className="card"><h3>Avaliação inicial</h3><p className="muted">Entenda seu ponto de partida e defina metas reais.</p></div>
        <div className="card"><h3>Condição de lançamento</h3><p className="muted">Quem se pré-agenda recebe a oferta antes de todo mundo.</p></div>
      </section>

      <section id="agendar" className="container form-wrap">
        {estado === 'ok' ? (
          <div className="card sucesso">
            <h2>Tudo certo!</h2>
            <p>Recebemos seu pré-agendamento. Nossa equipe vai chamar você no WhatsApp para confirmar o dia e o horário.</p>
          </div>
        ) : (
          <form className="card" onSubmit={enviar} noValidate>
            <h2>Faça seu pré-agendamento</h2>

            <label className="field">
              <span>Nome completo *</span>
              <input value={f.nome} onChange={set('nome')} maxLength={120} autoComplete="name" />
            </label>

            <label className="field">
              <span>WhatsApp (com DDD) *</span>
              <input
                value={f.whatsapp}
                onChange={(e) => setF((s) => ({ ...s, whatsapp: maskWhats(e.target.value) }))}
                inputMode="tel"
                placeholder="(81) 99999-9999"
                autoComplete="tel"
              />
            </label>

            <label className="field">
              <span>E-mail (opcional)</span>
              <input type="email" value={f.email} onChange={set('email')} maxLength={160} autoComplete="email" />
            </label>

            <div className="grid-2">
              <label className="field">
                <span>Dia preferido para a visita</span>
                <input type="date" value={f.dia} min={hojeISO()} onChange={set('dia')} />
              </label>
              <label className="field">
                <span>Período</span>
                <select value={f.periodo} onChange={set('periodo')}>
                  {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Seu objetivo</span>
              <select value={f.objetivo} onChange={set('objetivo')}>
                {OBJETIVOS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>

            {/* honeypot: escondido de humanos */}
            <input
              className="hp"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={f.empresa}
              onChange={set('empresa')}
              name="empresa"
            />

            <label className="check">
              <input type="checkbox" checked={f.consentimento} onChange={set('consentimento')} />
              <span>
                Concordo em receber contato da academia por WhatsApp/e-mail sobre minha visita e a inauguração.
                Meus dados serão usados apenas para esse fim (LGPD).
              </span>
            </label>

            {erro && <p className="alert alert-erro">{erro}</p>}

            <button className="btn" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Confirmar pré-agendamento'}
            </button>
          </form>
        )}
      </section>

      <footer className="container foot">
        <span className="muted">© {new Date().getFullYear()} {NOME}</span>
      </footer>
    </div>
  )
}
