import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Landing_Page from './landing_page'

function RootRoute() {
  const { user, loading } = useAuth()

  if (loading) return null

  return user ? <Navigate to="/Home" replace /> : <Landing_Page />
}

export default RootRoute