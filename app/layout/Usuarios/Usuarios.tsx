import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, ShieldCheck, ShieldAlert } from 'lucide-react';
import Header from '../../components/Header';
import UserCard from '../../components/UserCard';
import { getUsuarios, deleteUsuario } from '../../../src/service/usuarios.service';
import type { Usuario } from '../../../src/types';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import WarningModal from '../../components/modals/WarningModal';

import { useRealtimeUsuarios } from '../../../src/hooks/realtime';
import { useConexion } from '../../../src/hooks/useConexion';

export default function Usuarios() {
  const isOnline = useConexion();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroCredenciales, setFiltroCredenciales] = useState('');
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null);

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: ''
  });

  const [listaUsuarios, setListaUsuarios] = useState<Usuario[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const observerTarget = useRef<HTMLDivElement | null>(null);
  useRealtimeUsuarios(setListaUsuarios, { filtroRol, filtroCredenciales, debouncedBusqueda });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(busqueda);
    }, 400);
    return () => clearTimeout(handler);
  }, [busqueda]);

  const cargarUsuarios = async (paginaDestino: number, reiniciarLista: boolean = false) => {
    if (reiniciarLista) setIsLoading(true);
    else setLoadingMore(true);

    const resultado = await getUsuarios(paginaDestino, 10, debouncedBusqueda, filtroRol, filtroCredenciales);

    if (reiniciarLista) {
      setListaUsuarios(resultado.data);
    } else {
      setListaUsuarios(prev => {
        const idsExistentes = new Set(prev.map(u => u.id_perfil_info));
        const nuevosUnicos = resultado.data.filter(u => !idsExistentes.has(u.id_perfil_info));
        return [...prev, ...nuevosUnicos];
      });
    }

    setHasMore(resultado.hasMore);
    setIsLoading(false);
    setLoadingMore(false);
  };

  // Se dispara si cambia cualquier filtro
  useEffect(() => {
    setPage(0);
    cargarUsuarios(0, true);
  }, [debouncedBusqueda, filtroRol, filtroCredenciales]);

  useEffect(() => {
    if (page > 0) {
      cargarUsuarios(page, false);
    }
  }, [page]);

  useEffect(() => {
    if (isLoading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prevPage) => prevPage + 1);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) observer.unobserve(observerTarget.current);
    };
  }, [isLoading, loadingMore, hasMore]);

  const handleConfirmDelete = async () => {
    if (!usuarioAEliminar) return;

    const res = await deleteUsuario(
      usuarioAEliminar.id_perfil_info,
      usuarioAEliminar.auth_usuario
    );

    if (res.success) {
      setListaUsuarios(prev => prev.map(u =>
        u.id_perfil_info === usuarioAEliminar.id_perfil_info
          ? { ...u, auth_usuario: null }
          : u
      ));
      setModalState({
        ...modalState,
        success: true,
        successMessage: 'Acceso revocado y credenciales eliminadas exitosamente del servidor.'
      });
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error al revocar el acceso.' });
    }
    setUsuarioAEliminar(null);
  };

  const handleAgregarCredenciales = (usuario: Usuario) => {
    navigate('/auth/AsignarCredenciales', {
      state: { usuario: usuario }
    });
  };

  const usuariosActivos = listaUsuarios.filter(u => u.auth_usuario !== null);
  const usuariosInactivos = listaUsuarios.filter(u => u.auth_usuario === null);

  return (
    <>
      <Header title="Personal" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Personal del Sistema</h1>
            <p>Gestiona usuarios y sus permisos según el rol asignado.</p>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/nuevo-usuario')}
            disabled={!isOnline}
            title={!isOnline ? 'Requiere conexión a internet' : ''}
          >
            <UserPlus size={18} />
            Agregar nuevo usuario
          </button>
        </div>

        {/* Filtros */}
        <div className="card card-context context-info" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}>
            <div className="form-group">
              <label className="form-label">Búsqueda</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--sys-text-light)',
                }} />
                <input
                  className="form-input"
                  placeholder="Nombre, usuario o correo"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Rol</label>
              <select
                className="form-select"
                value={filtroRol}
                onChange={(e) => setFiltroRol(e.target.value)}
              >
                <option value="">Todos los roles</option>
                <option value="administrador">Administrador</option>
                <option value="limitado">Limitado</option>
                <option value="minimo">Mínimo</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Credenciales</label>
              <select
                className="form-select"
                value={filtroCredenciales}
                onChange={(e) => setFiltroCredenciales(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="activo">Acceso Activo</option>
                <option value="inactivo">Sin Acceso (Historial)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contenedor Principal de Listados */}
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sys-text-muted)' }}>Cargando usuarios...</div>
        ) : listaUsuarios.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sys-text-muted)' }}>No se encontraron usuarios.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* GRUPO 1: CON CREDENCIALES ACTIVAS */}
            {usuariosActivos.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <ShieldCheck size={18} style={{ color: 'var(--sys-success)' }} />
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
                    Personal con Acceso Activo ({usuariosActivos.length})
                  </h2>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                }}>
                  {usuariosActivos.map((u) => (
                    <UserCard
                      key={u.id_perfil_info}
                      usuario={u}
                      isOnline={isOnline}
                      onDelete={(u) => setUsuarioAEliminar(u)}
                      onAddCredentials={(u) => handleAgregarCredenciales(u)}
                      onClick={(u) => navigate(`/usuario/${u.id_perfil_info}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* GRUPO 2: HISTORIAL O INACTIVOS (MANDADOS AL FINAL) */}
            {usuariosInactivos.length > 0 && (
              <div style={{ borderTop: '1px dashed var(--sys-border)', paddingTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <ShieldAlert size={18} style={{ color: 'var(--sys-text-muted)' }} />
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--sys-text-muted)' }}>
                    Historial de Personal / Sin Acceso ({usuariosInactivos.length})
                  </h2>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                  opacity: 0.65
                }}>
                  {usuariosInactivos.map((u) => (
                    <UserCard
                      key={u.id_perfil_info}
                      usuario={u}
                      isOnline={isOnline}
                      onDelete={(u) => setUsuarioAEliminar(u)}
                      onAddCredentials={(u) => handleAgregarCredenciales(u)}
                      onClick={(u) => navigate(`/usuario/${u.id_perfil_info}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Trigger de Scroll Infinito */}
            <div
              ref={observerTarget}
              style={{
                height: '20px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'var(--sys-text-muted)',
                fontSize: '13px',
                marginTop: '10px'
              }}
            >
              {loadingMore && "Cargando más personal..."}
            </div>
          </div>
        )}
      </div>

      <WarningModal
        isOpen={usuarioAEliminar !== null}
        onClose={() => setUsuarioAEliminar(null)}
        onConfirm={handleConfirmDelete}
        title="Revocar Acceso por Completo"
        message={
          <>
            ¿Estás seguro de que deseas eliminar permanentemente las credenciales de <b>{usuarioAEliminar?.nombres} {usuarioAEliminar?.apellido_paterno}</b>?
            <span style={{ display: 'block', marginTop: 8 }}>
              Las credenciales de acceso se borrarán del servidor de autenticación de inmediato. El perfil se mandará al fondo de la lista para conservar su historial.
            </span>
          </>
        }
      />
      <ErrorModal
        isOpen={modalState.error}
        onClose={() => setModalState({ ...modalState, error: false })}
        title="Error"
        message={modalState.errorMessage}
      />
      <SuccessModal
        isOpen={modalState.success}
        onClose={() => setModalState({ ...modalState, success: false })}
        title="¡Éxito!"
        message={modalState.successMessage}
      />

    </>

  );
}



