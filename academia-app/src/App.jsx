import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import StaffLayout from './components/StaffLayout.jsx'
import PreAgendamento from './pages/PreAgendamento.jsx'
import Login from './pages/Login.jsx'
import Recepcao from './pages/Recepcao.jsx'
import Alunos from './pages/Alunos.jsx'
import Leads from './pages/Leads.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PreAgendamento />} />
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <StaffLayout />
          </RequireAuth>
        }
      >
        <Route path="/recepcao" element={<Recepcao />} />
        <Route path="/alunos" element={<Alunos />} />
        <Route path="/leads" element={<Leads />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
