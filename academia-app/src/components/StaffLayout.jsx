import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function StaffLayout() {
  const navigate = useNavigate()

  async function sair() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="staff">
      <header className="staff-bar">
        <strong className="brand">PAINEL</strong>
        <nav>
          <NavLink to="/recepcao">Recepção</NavLink>
          <NavLink to="/alunos">Alunos</NavLink>
          <NavLink to="/leads">Leads</NavLink>
        </nav>
        <button className="btn-ghost" onClick={sair}>Sair</button>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}
