/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DashboardProvider } from './context/DashboardContext'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import App from './App.jsx'
import './index.css'

function AuthenticatedApp() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading" aria-label="Cargando" />
  if (!user) return <LoginPage />
  return <DashboardProvider><App /></DashboardProvider>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><AuthenticatedApp /></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
