import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { RolUsuario } from '../types';

interface RoleRouteProps {
  roles: RolUsuario[];
}

// Se usa DENTRO de <ProtectedRoute> (o sea, ya sabemos que hay sesión).
// Si el rol del perfil no está en la lista permitida, redirige a
// /dashboard en vez de dejar que la página se renderice rota o
// muestre datos vacíos por culpa de RLS.
export const RoleRoute = ({ roles }: RoleRouteProps) => {
  const { perfil, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Cargando sistema...
      </div>
    );
  }

  if (!perfil || !roles.includes(perfil.rol)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
