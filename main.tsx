import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './app/css/main.css'

import { AuthProvider } from './src/context/AuthContext'
import { RealtimeProvider } from './src/provider/RealtimeProvider.tsx'
import { SecureNavigationProvider } from './src/context/SecureNavigationContext';
import { ProtectedRoute } from './src/helpers/ProtectedRoute.tsx'
import { RoleRoute } from './src/helpers/RoleRoute.tsx'
import SecureRoute from './src/helpers/SecureRoute';

import Login from './app/layout/Auth/login.tsx'
import ConfirmarCorreo from './app/layout/Auth/ConfirmarCorreo.tsx'
import RestablecerPassword from './app/layout/Auth/RestablecerPassword.tsx'
import CambiarCorreo from './app/layout/Auth/CambiarCorreo.tsx'
import AddCredentials from './app/layout/Auth/AddCredentials.tsx';
import ActualizarCredencialesPassword from './app/layout/Auth/ActualizarCredencialesPassword.tsx';

import AppLayout from './app/layout/AppLayout.tsx'
import Dashboard from './app/layout/Dashboard/Dashboard.tsx'
import NuevaOrden from './app/layout/Ordenes/NuevaOrden.tsx'
import OrdenesPendientes from './app/layout/Ordenes/OrdenesPendientes.tsx'
import DetalleOrden from './app/layout/Ordenes/DetalleOrden.tsx'
import CerrarOrden from './app/layout/Ordenes/CerrarOrden.tsx'
import Usuarios from './app/layout/Usuarios/Usuarios.tsx'
import NuevoUsuario from './app/layout/Usuarios/NuevoUsuario.tsx'
import DetalleUsuario from './app/layout/Usuarios/DetalleUsuario.tsx'
import Reportes from './app/layout/Reportes/Reportes.tsx'
import Historial from './app/layout/Historial/Historial.tsx'
import Clientes from './app/layout/Clientes/Clientes.tsx'
import NuevoCliente from './app/layout/Clientes/NuevoCliente.tsx'
import DetalleClientes from './app/layout/Clientes/DetalleClientes.tsx'
import Perfil from './app/layout/Auth/perfil.tsx'
import Configuracion from './app/layout/Configuraciones/Configuracion.tsx'
import DetalleEmpresa from './app/layout/Clientes/DetalleEmpresa.tsx'
import ReasignarOrden from './app/layout/Ordenes/reasignacionTecnico.tsx'
import Contactos from './app/layout/Configuraciones/contactos.tsx'

const AppProviders = () => {
  return (
    <AuthProvider>
      <SecureNavigationProvider>
        <RealtimeProvider>
          <Outlet />
        </RealtimeProvider>
      </SecureNavigationProvider>
    </AuthProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/auth/ActualizarCredenciales" element={<ActualizarCredencialesPassword />} />
        <Route element={<AppProviders />}>
          <Route path="/" element={<Login />} />
          <Route path="/auth/confirmar" element={<ConfirmarCorreo />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/auth/reset-password" element={<RestablecerPassword />} />
            <Route path="/auth/CambiarCorreo" element={<CambiarCorreo />} />
            <Route path="/auth/AsignarCredenciales" element={<AddCredentials />} />
            <Route element={<AppLayout />}>
              {/* Accesibles para los 3 roles */}
              <Route path="/contactos" element={<Contactos />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ordenes-pendientes" element={<OrdenesPendientes />} />
              <Route path="/historial" element={<Historial />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/configuracion/perfil" element={<Perfil />} />
              <Route
                path="/orden/:id"
                element={
                  <SecureRoute>
                    <DetalleOrden />
                  </SecureRoute>
                }
              />
              <Route
                path="/cerrar-orden/:id"
                element={
                  <SecureRoute>
                    <CerrarOrden />
                  </SecureRoute>
                }
              />
              <Route
                path="/orden/:id/reasignar"
                element={
                  <SecureRoute>
                    <ReasignarOrden />
                  </SecureRoute>
                }
              />

              {/* administrador + limitado: gestión operativa (crear/editar
                  órdenes y clientes), pero no Personal ni Reportes */}
              <Route element={<RoleRoute roles={['administrador', 'limitado']} />}>
                <Route path="/nueva-orden" element={<NuevaOrden />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/nuevo-cliente" element={<NuevoCliente />} />
                <Route
                  path="/clientes/:id"
                  element={
                    <SecureRoute>
                      <DetalleClientes />
                    </SecureRoute>
                  }
                />
                <Route
                  path="/empresas/:id"
                  element={
                    <SecureRoute>
                      <DetalleEmpresa />
                    </SecureRoute>
                  }
                />
              </Route>

              {/* Solo administrador: Personal y Reportes */}
              <Route element={<RoleRoute roles={['administrador']} />}>
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/nuevo-usuario" element={<NuevoUsuario />} />
                <Route
                  path="/usuario/:id"
                  element={
                    <SecureRoute>
                      <DetalleUsuario />
                    </SecureRoute>
                  }
                />
                <Route path="/reportes" element={<Reportes />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)