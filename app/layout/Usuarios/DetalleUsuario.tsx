import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSecureParams } from '../../../src/hooks/useSecureParams';
import {
  ArrowLeft, Edit3, Save, X, Mail, Phone,
  ShieldCheck, UserCheck, AlertCircle, Clock, MapPin, Lock
} from 'lucide-react';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormSelect from '../../components/FormSelect';
import { getUsuarioById, updateUsuario } from '../../../src/service/usuarios.service';
import type { Usuario, RolUsuario } from '../../../src/types';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { useConexion } from '../../../src/hooks/useConexion';
import { useActividadUsuario } from '../../../src/hooks/useActividadUsuario';
import { traducirActividad, type MapasActividad, type ActividadTraducida, mapasVacios } from '../../../src/utils/traducirActividad';
import { formatFecha } from '../../../src/utils/dateFormatter';
import { getUsuariosNombres } from '../../../src/service/usuarios.service';
import { getClientes, getEmpresas } from '../../../src/service/clientes.service';
import { getMapaNumerosOrden } from '../../../src/service/ordenes.service';

const rolColors: Record<string, string> = {
  'administrador': 'var(--sys-primary)',
  'limitado': 'var(--sys-purple)',
  'minimo': 'var(--sys-cyan)',
};

const rolLabels: Record<string, string> = {
  'administrador': 'Administrador',
  'limitado': 'Limitado',
  'minimo': 'Mínimo',
};

// Permisos por rol — reflejan el acceso REAL de la app (sidebar +
// RoleRoute en main.tsx), no la implementación interna de la BD.
// Si cambias qué puede ver/hacer cada rol en el sidebar o en las
// rutas, actualiza esto también para que no se desalinee.
const rolPermisos: Record<string, { modulo: string; nivel: string; color: string }[]> = {
  administrador: [
    { modulo: 'Órdenes', nivel: 'Crear, ver todas, reasignar y cerrar', color: 'var(--sys-success)' },
    { modulo: 'Clientes', nivel: 'Crear y gestionar', color: 'var(--sys-success)' },
    { modulo: 'Personal', nivel: 'Alta, baja y edición', color: 'var(--sys-success)' },
    { modulo: 'Reportes', nivel: 'Acceso completo', color: 'var(--sys-success)' },
  ],
  limitado: [
    { modulo: 'Órdenes', nivel: 'Crear, ver todas, reasignar y cerrar', color: 'var(--sys-warning)' },
    { modulo: 'Clientes', nivel: 'Crear y gestionar', color: 'var(--sys-warning)' },
    { modulo: 'Personal', nivel: 'Sin acceso', color: 'var(--sys-text-muted)' },
    { modulo: 'Reportes', nivel: 'Sin acceso', color: 'var(--sys-text-muted)' },
  ],
  minimo: [
    { modulo: 'Órdenes', nivel: 'Solo las propias y en las que apoya — ver y cerrar', color: 'var(--sys-info)' },
    { modulo: 'Clientes', nivel: 'Sin acceso', color: 'var(--sys-text-muted)' },
    { modulo: 'Personal', nivel: 'Sin acceso', color: 'var(--sys-text-muted)' },
    { modulo: 'Reportes', nivel: 'Sin acceso', color: 'var(--sys-text-muted)' },
  ],
};

const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sys-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: 14, color: 'var(--sys-text-dark)', fontWeight: 500 }}>
      {value || '—'}
    </div>
  </div>
);

export default function DetalleUsuario() {
  const isOnline = useConexion();
  const { id } = useSecureParams<{ id: string }>();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);


  const [isLoading, setIsLoading] = useState(true);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const { actividad, fetchActividad, hasMore, loading: loadingActividad } = useActividadUsuario(usuario?.id_perfil_info || '');
  const [maps, setMaps] = useState<MapasActividad>(mapasVacios);
  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    warning: false,
    errorMessage: '',
    successMessage: ''
  });

  // Efecto 1: Cargar únicamente el Perfil de Usuario
  useEffect(() => {
    const fetchUsuario = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const res = await getUsuarioById(id);
        if (res) {
          const mappedUser = {
            ...res,
            id: res.id_perfil_info,
            correo_personal: res.contacto?.correo_personal ?? '',
            lada: res.contacto?.lada ?? '',
            telefono: res.contacto?.telefono ?? '',
            direccion: res.contacto?.direccion ?? '',
          };
          setUsuario(mappedUser);
          setFormData({
            nombres: mappedUser.nombres,
            apellido_paterno: mappedUser.apellido_paterno,
            apellido_materno: mappedUser.apellido_materno,
            usuario: mappedUser.usuario,
            correo_personal: mappedUser.correo_personal,
            lada: mappedUser.lada,
            telefono: mappedUser.telefono,
            direccion: mappedUser.direccion,
            rol: mappedUser.rol,
          });
        }
      } catch (err) {
        console.error("Error al cargar perfil de usuario", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsuario();
  }, [id]); // Solo depende del ID de la URL

  // Efecto 2: Cargar el historial SOLO cuando ya tenemos el 
  useEffect(() => {
    if (usuario?.id_perfil_info) {
      fetchActividad(8, true);
    }
  }, [usuario?.id_perfil_info, fetchActividad]);

  // Efecto 3: Cargar una sola vez los mapas id -> nombre que se usan
  // para traducir el historial global (a quién le modificó el perfil,
  // qué cliente/empresa/orden tocó, etc.)
  useEffect(() => {
    Promise.all([
      getUsuariosNombres(),
      getClientes(),
      getEmpresas(),
      getMapaNumerosOrden(),
    ]).then(([usuarios, clientes, empresas, ordenes]) => {
      setMaps({
        usuarios,
        clientes: new Map((clientes ?? []).map((c: any) => [c.id_cliente, c.nombre || 'Sin nombre'])),
        empresas: new Map((empresas ?? []).map((e: any) => [e.id_empresa, e.nombre || 'Sin nombre'])),
        ordenes,
      });
    });
  }, []);

  if (isLoading) {
    return (
      <>
        <Header title="Perfil de Usuario" />
        <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
          <p style={{ color: 'var(--sys-text-muted)' }}>Cargando perfil de usuario...</p>
        </div>
      </>
    );
  }

  if (!usuario || !formData) {
    return (
      <>
        <Header title="Perfil de Usuario" />
        <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
          <AlertCircle size={48} style={{ color: 'var(--sys-text-light)', marginBottom: 16 }} />
          <h2 style={{ color: 'var(--sys-text-dark)' }}>Usuario no encontrado</h2>
          <p style={{ color: 'var(--sys-text-muted)' }}>El perfil solicitado no existe en el sistema.</p>
          <button className="btn btn-primary" onClick={() => navigate('/usuarios')}>
            <ArrowLeft size={16} /> Regresar
          </button>
        </div>
      </>
    );
  }

  const initials = `${usuario.nombres[0]}${usuario.apellido_paterno[0]}`;
  const bgColor = rolColors[usuario.rol] || 'var(--sys-primary)';
  const permisos = rolPermisos[usuario.rol] || [];

  const handleChange = (field: string) => (value: string) => {
    setFormData((prev: any) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleGuardar = async () => {
    if (!id) return;
    if (enviando) return;
    setEnviando(true);
    const res = await updateUsuario(id, { ...formData }, usuario);

    if (res.success) {

      setUsuario({ ...usuario, ...formData });

      setModalState({
        ...modalState,
        success: true,
        successMessage: 'Cambios registrados.'
      });
      setEditando(false);
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error ?? 'Error desconocido' });
    }
  };

  const handleCambiarContraseña = () => {
    if (!usuario?.auth_usuario) {
      setModalState({
        ...modalState,
        error: true,
        errorMessage: 'Este perfil no tiene un usuario de autenticación asociado en la base de datos.'
      });
      return;
    }

    navigate('/auth/reset-password', {
      state: { authUsuarioId: usuario.auth_usuario }
    });
  };

  const handleCambiarCorreo = () => {
    if (!usuario?.auth_usuario) {
      setModalState({
        ...modalState,
        error: true,
        errorMessage: 'Este perfil no tiene un usuario de autenticación asociado en la base de datos.'
      });
      return;
    }

    // Enviamos la ruta estática y pasamos el ID de manera interna en 'state'
    navigate('/auth/CambiarCorreo', {
      state: { authUsuarioId: usuario.auth_usuario }
    });
  };

  return (
    <>
      <Header title={`${usuario.nombres} ${usuario.apellido_paterno} ${usuario.apellido_materno}`} />
      <div className="app-content">
        {/* Encabezado */}
        <div className="page-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1>Perfil de Usuario</h1>
              <p>Información detallada del usuario seleccionado</p>
            </div>
          </div>

          <div className="action-bar">
            <button className="btn btn-primary" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Regresar
            </button>
            {editando ? (
              <>
                <button className="btn btn-ghost" onClick={() => setEditando(false)}>
                  <X size={16} /> Cancelar
                </button>
                <button className="btn btn-primary" onClick={handleGuardar}>
                  <Save size={16} /> Guardar Cambios
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline-primary" onClick={() => setEditando(true)}>
                  <Edit3 size={16} /> Editar Perfil
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="content-grid-two">
          {/* Avatar + Datos Personales (Perfil_info) */}
          <div className="card card-context context-success animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 20, borderBottom: '1px solid var(--sys-border)' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: bgColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 700, color: 'var(--sys-surface)',
                flexShrink: 0,
                boxShadow: `0 4px 14px ${bgColor}40`,
              }}>
                {initials}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--sys-text-dark)' }}>
                  {usuario.nombres} {usuario.apellido_paterno} {usuario.apellido_materno}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--sys-text-muted)', fontFamily: 'monospace' }}>{usuario.usuario}</span>
                <br />
                <span className="badge badge-rol" style={{ background: `${bgColor}15`, color: bgColor, marginTop: 6, display: 'inline-block' }}>
                  {rolLabels[usuario.rol]}
                </span>
              </div>
            </div>

            {editando ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FormInput
                  label="Nombres"
                  value={formData.nombres}
                  onChange={handleChange('nombres')}
                  id="du-nombres"
                />

                <FormInput
                  label="Usuario"
                  value={formData.usuario}
                  onChange={handleChange('usuario')}
                  id="du-usuario"
                />

                <FormInput
                  label="Apellido Paterno"
                  value={formData.apellido_paterno}
                  onChange={handleChange('apellido_paterno')}
                  id="du-ap"
                />

                <FormInput
                  label="Apellido Materno"
                  value={formData.apellido_materno}
                  onChange={handleChange('apellido_materno')}
                  id="du-am"
                />

                <FormSelect
                  label="Rol"
                  value={formData.rol}
                  onChange={(v) => setFormData((prev: any) => prev ? { ...prev, rol: v as RolUsuario } : prev)}
                  id="du-rol"
                  options={[
                    { value: 'administrador', label: 'Administrador' },
                    { value: 'limitado', label: 'Limitado' },
                    { value: 'minimo', label: 'Mínimo' },
                  ]}
                />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <UserCheck size={16} style={{ color: 'var(--sys-primary)' }} />
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>Información del Perfil</h4>
                </div>
                <InfoItem label="Nombres" value={usuario.nombres} />
                <InfoItem label="Apellido Paterno" value={usuario.apellido_paterno} />
                <InfoItem label="Apellido Materno" value={usuario.apellido_materno} />
                <InfoItem label="Usuario" value={`${usuario.usuario}`} />
                <InfoItem label="Rol" value={`${rolLabels[usuario.rol]}`} />
              </>
            )}
          </div>

          {/* Contacto + Permisos + Contraseña */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Contacto */}
            <div className="card card-context context-info animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <Mail size={16} style={{ color: 'var(--sys-primary)' }} />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>Datos de Contacto</h4>
              </div>
              {editando ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput label="Correo Personal" value={formData.correo_personal} onChange={handleChange('correo_personal')} type="email" id="du-correo" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ width: 80 }}>
                      <FormInput label="Lada" value={formData.lada} onChange={handleChange('lada')} id="du-lada" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <FormInput label="Teléfono" value={formData.telefono} onChange={handleChange('telefono')} id="du-telefono" />
                    </div>
                  </div>
                  <FormInput label="Dirección" value={formData.direccion} onChange={handleChange('direccion')} id="du-direccion" />
                </div>
              ) : (
                <>
                  {[
                    {
                      icon: <Mail size={16} />,
                      label: 'Correo personal',
                      value: formData.correo_personal
                    },
                    {
                      icon: <Phone size={16} />,
                      label: 'Teléfono',
                      value: formData.lada ? `+${formData.lada} ${formData.telefono}` : formData.telefono
                    },
                    {
                      icon: <MapPin size={16} />,
                      label: 'Dirección',
                      value: formData.direccion
                    },
                  ].map(({ icon, label, value }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, padding: '10px 14px', background: 'var(--sys-bg)', borderRadius: 8 }}>
                      <span style={{ color: 'var(--sys-text-light)', flexShrink: 0, marginTop: 2 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sys-text-dark)' }}>{value}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Permisos RLS */}
            <div className="card card-context context-warning animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <ShieldCheck size={16} style={{ color: 'var(--sys-warning)' }} />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>Permisos del Perfil — <span style={{ color: bgColor }}>{rolLabels[usuario.rol]}</span></h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {permisos.map(({ modulo, nivel, color }) => (
                  <div key={modulo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--sys-bg)', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--sys-text-dark)' }}>{modulo}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color }}>{nivel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Contraseña y Accesos */}
        {usuario.auth_usuario && (
          <div className="card card-context context-danger animate-fade-in-up" style={{ marginTop: 20, animationDelay: '0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Lock size={16} style={{ color: 'var(--sys-danger-text)' }} />
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>
                Credenciales y Acceso
              </h4>
            </div>

            <p style={{ fontSize: 13, color: 'var(--sys-text-base)', marginBottom: 20, lineHeight: 1.5 }}>
              Los usuarios registrados en el sistema tienen acceso a la aplicación. Puedes gestionar sus credenciales desde aquí.
            </p>

            {!isOnline && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13 }}>
                <AlertCircle size={16} />
                <span>La modificación de credenciales requiere acceso directo al servidor. Vuelve a conectarte a internet para habilitar estas opciones.</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline-primary"
                onClick={handleCambiarContraseña}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={!isOnline}
              >
                <Lock size={14} />
                Forzar Nueva Contraseña
              </button>

              <button
                className="btn btn-outline-primary"
                onClick={handleCambiarCorreo}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={!isOnline}
              >
                <Mail size={14} />
                Cambiar Correo de Acceso
              </button>
            </div>
          </div>
        )}


        {/* Actividad Reciente */}
        <div className="card card-context context-info animate-fade-in-up" style={{ marginTop: 20, animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Clock size={18} style={{ color: 'var(--sys-primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
              Actividad Reciente
            </h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 16px 0' }}>
            Todo lo que {usuario.nombres} ha hecho en el sistema: perfiles, clientes, empresas y órdenes que ha creado, modificado o eliminado.
          </p>

          <div className="timeline">
            {(() => {
              // Traducimos cada entrada y descartamos las que el traductor
              // marca como ruido técnico interno (ej. marcas de versionado).
              const entradas = actividad
                .map((entry) => ({ entry, traducida: traducirActividad(entry, maps) }))
                .filter((e) => e.traducida !== null) as { entry: any; traducida: ActividadTraducida }[];

              if (entradas.length === 0) {
                return <p style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>No hay actividad reciente.</p>;
              }

              return (
                <>
                  {entradas.map(({ entry, traducida }) => (
                    <div key={entry.id_log} className="timeline-item" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                      <div className="timeline-dot" style={{ marginTop: 4 }}>
                        {/* Círculo indicador del timeline */}
                        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--sys-primary)' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                            {formatFecha(entry.created)}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--sys-text-light)' }}>
                            {formatFecha(entry.created, true).split(', ')[1]}
                          </span>
                        </div>

                        {/* 1. Encabezado traducido: "Modificó el perfil de Juan Pérez López" */}
                        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--sys-text-base)', margin: 0, lineHeight: 1.4 }}>
                          {traducida.encabezado}
                        </p>

                        {/* 2. Detalle campo por campo: "Nombre(s): jose ➔ juan" */}
                        {traducida.cambios.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                            {traducida.cambios.map((cambio, idx) => (
                              <p key={idx} style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: 0, fontFamily: 'monospace' }}>
                                {cambio.etiqueta}: {cambio.antes} ➔ {cambio.despues}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Botón para cargar más historial */}
                  {hasMore && (
                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => fetchActividad(8, false)}
                        disabled={loadingActividad}
                        style={{ fontSize: 13 }}
                      >
                        {loadingActividad ? 'Cargando...' : 'Cargar más actividad'}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>


      </div>

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