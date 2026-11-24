import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setLoading(false)
    if (error) {
      setErro('E-mail ou senha incorretos.')
      return
    }
    navigate('/recepcao')
  }

  return (
    <div className="center-screen">
      <form className="card narrow" onSubmit={entrar}>
        <img className="login-logo" src={logo} alt="GF Fitness" />
        <h2 style={{ textAlign: 'center' }}>Acesso da equipe</h2>
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
        </label>
        {erro && <p className="alert alert-erro">{erro}</p>}
        <button className="btn" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
