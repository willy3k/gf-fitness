import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Só deixa passar quem está logado E consta na tabela `staff`.
export default function RequireAuth({ children }) {
  const [estado, setEstado] = useState('carregando') // carregando | sem-sessao | sem-permissao | ok

  useEffect(() => {
    let ativo = true

    async function checar(session) {
      if (!session) {
        if (ativo) setEstado('sem-sessao')
        return
      }
      const { data } = await supabase.rpc('is_staff')
      if (ativo) setEstado(data === true ? 'ok' : 'sem-permissao')
    }

    supabase.auth.getSession().then(({ data }) => checar(data.session))

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      // setTimeout evita travar o cliente do Supabase dentro do callback
      setTimeout(() => checar(session), 0)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (estado === 'carregando') return <div className="center-screen">Carregando…</div>
  if (estado === 'sem-sessao') return <Navigate to="/login" replace />
  if (estado === 'sem-permissao') {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>Sem permissão</h2>
          <p className="muted">Seu usuário não está autorizado a acessar o painel. Peça ao administrador para cadastrá-lo na equipe.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    )
  }
  return children
}
