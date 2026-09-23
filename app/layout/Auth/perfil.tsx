import { useState, useEffect } from 'react';
import {
    Mail, Phone, MapPin, ShieldCheck,
    UserCheck, AlertCircle, Clock, Lock, Key, Eye, EyeOff
} from 'lucide-react';
import Header from '../../components/Header';
import { getUsuarioByAuthId, getUsuariosNombres } from '../../../src/service/usuarios.service';
import { getClientes, getEmpresas } from '../../../src/service/clientes.service';
import { getMapaNumerosOrden } from '../../../src/service/ordenes.service';
import type { Usuario } from '../../../src/types';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { useActividadUsuario } from '../../../src/hooks/useActividadUsuario';
import { traducirActividad, type MapasActividad, type ActividadTraducida, mapasVacios } from '../../../src/utils/traducirActividad';
import { formatFecha } from '../../../src/utils/dateFormatter';
import { supabase } from '../../../src/utils/supabase';
import { changeOwnPassword } from '../../../src/service/auth.service';

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

export default function Perfil() {
    const [isLoading, setIsLoading] = useState(true);
    const [usuario, setUsuario] = useState<Usuario | null>(null);
    const [perfilId, setPerfilId] = useState<string | null>(null);

    // Estado formulario cambio de contraseña
    const [passwordForm, setPasswordForm] = useState({ nueva: '', confirmar: '' });
    const [showNueva, setShowNueva] = useState(false);
    const [showConfirmar, setShowConfirmar] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    const { actividad, fetchActividad, hasMore, loading: loadingActividad } = useActividadUsuario(perfilId || '');
    const [maps, setMaps] = useState<MapasActividad>(mapasVacios);
    const [modalState, setModalState] = useState({
        success: false,
        error: false,
        errorMessage: '',
        successMessage: ''
    });

    // Efecto 1: Obtener el usuario autenticado actual y cargar su perfil
    useEffect(() => {
        const fetchPerfil = async () => {
            setIsLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Buscamos el perfil asociado al auth user (asumiendo que el servicio acepta auth_id)
                const res = await getUsuarioByAuthId(user.id);
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
                    setPerfilId(mappedUser.id_perfil_info);
                }
            } catch (err) {
                console.error('Error al cargar perfil propio', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPerfil();
    }, []);

    // Efecto 2: Cargar actividad una vez tengamos el perfil
    useEffect(() => {
        if (perfilId) {
            fetchActividad(8, true);
        }
    }, [perfilId, fetchActividad]);

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

    const handleCambiarPassword = async () => {
        const { nueva, confirmar } = passwordForm;

        if (!nueva || nueva.length < 8) {
            setModalState({ ...modalState, error: true, errorMessage: 'La contraseña debe tener al menos 6 caracteres.' });
            return;
        }
        if (nueva !== confirmar) {
            setModalState({ ...modalState, error: true, errorMessage: 'Las contraseñas no coinciden.' });
            return;
        }

        setIsSavingPassword(true);
        const result = await changeOwnPassword(nueva);
        setIsSavingPassword(false);

        if (result.success) {
            setPasswordForm({ nueva: '', confirmar: '' });
            setModalState({ ...modalState, success: true, successMessage: result.message || 'Contraseña actualizada exitosamente.' });
        } else {
            setModalState({ ...modalState, error: true, errorMessage: result.error || 'Error al actualizar la contraseña.' });
        }
    };
    if (isLoading) {
        return (
            <>
                <Header title="Mi Perfil" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <p style={{ color: 'var(--sys-text-muted)' }}>Cargando tu perfil...</p>
                </div>
            </>
        );
    }

    if (!usuario) {
        return (
            <>
                <Header title="Mi Perfil" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <AlertCircle size={48} style={{ color: 'var(--sys-text-light)', marginBottom: 16 }} />
                    <h2 style={{ color: 'var(--sys-text-dark)' }}>Perfil no encontrado</h2>
                    <p style={{ color: 'var(--sys-text-muted)' }}>No se pudo cargar la información de tu perfil.</p>
                </div>
            </>
        );
    }

    const initials = `${usuario.nombres[0]}${usuario.apellido_paterno[0]}`;
    const bgColor = rolColors[usuario.rol] || 'var(--sys-primary)';
    const permisos = rolPermisos[usuario.rol] || [];

    return (
        <>
            <Header title={`${usuario.nombres} ${usuario.apellido_paterno} ${usuario.apellido_materno}`} />
            <div className="app-content">

                {/* Encabezado */}
                <div className="page-heading">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div>
                            <h1>Mi Perfil</h1>
                            <p>Información de tu cuenta en el sistema</p>
                        </div>
                    </div>
                </div>

                <div className="content-grid-two">

                    {/* Avatar + Datos Personales */}
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <UserCheck size={16} style={{ color: 'var(--sys-primary)' }} />
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>Información del Perfil</h4>
                        </div>
                        <InfoItem label="Nombres" value={usuario.nombres} />
                        <InfoItem label="Apellido Paterno" value={usuario.apellido_paterno} />
                        <InfoItem label="Apellido Materno" value={usuario.apellido_materno} />
                        <InfoItem label="Usuario" value={usuario.usuario} />
                        <InfoItem label="Rol" value={rolLabels[usuario.rol]} />
                    </div>

                    {/* Contacto + Permisos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Contacto */}
                        <div className="card card-context context-info animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                                <Mail size={16} style={{ color: 'var(--sys-primary)' }} />
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>Datos de Contacto</h4>
                            </div>
                            {[
                                {
                                    icon: <Mail size={16} />,
                                    label: 'Correo personal',
                                    value: usuario.contacto?.correo_personal
                                },
                                {
                                    icon: <Phone size={16} />,
                                    label: 'Teléfono',
                                    value: [
                                        usuario.contacto?.lada ? `+${usuario.contacto.lada}` : null,
                                        usuario.contacto?.telefono || null,
                                    ].filter(Boolean).join(' ') || undefined
                                },
                                {
                                    icon: <MapPin size={16} />,
                                    label: 'Dirección',
                                    value: usuario.contacto?.direccion
                                },
                            ].map(({ icon, label, value }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, padding: '10px 14px', background: 'var(--sys-bg)', borderRadius: 8 }}>
                                    <span style={{ color: 'var(--sys-text-light)', flexShrink: 0, marginTop: 2 }}>{icon}</span>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginBottom: 2 }}>{label}</div>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sys-text-dark)' }}>{value || '—'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Permisos RLS */}
                        <div className="card card-context context-warning animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                                <ShieldCheck size={16} style={{ color: 'var(--sys-warning)' }} />
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>
                                    Permisos del Perfil — <span style={{ color: bgColor }}>{rolLabels[usuario.rol]}</span>
                                </h4>
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

                {/* Cambiar Contraseña */}
                <div className="card card-context context-danger animate-fade-in-up" style={{ marginTop: 20, animationDelay: '0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Lock size={16} style={{ color: 'var(--sys-danger-text)' }} />
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)' }}>
                            Cambiar Contraseña
                        </h4>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--sys-text-base)', marginBottom: 20, lineHeight: 1.5 }}>
                        Actualiza tu contraseña directamente. Mínimo 8 caracteres.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Nueva contraseña */}
                        <div className="form-group">
                            <label className="form-label" style={{ marginBottom: 6 }}>Nueva Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                                <input
                                    type={showNueva ? 'text' : 'password'}
                                    className="form-input"
                                    style={{ paddingLeft: 38, paddingRight: 38 }}
                                    placeholder="Mínimo 8 caracteres"
                                    value={passwordForm.nueva}
                                    onChange={e => setPasswordForm(f => ({ ...f, nueva: e.target.value }))}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNueva(v => !v)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sys-text-light)', padding: 0, display: 'flex' }}
                                >
                                    {showNueva ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        {/* Confirmar contraseña */}
                        <div className="form-group">
                            <label className="form-label" style={{ marginBottom: 6 }}>Confirmar Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                                <input
                                    type={showConfirmar ? 'text' : 'password'}
                                    className="form-input"
                                    style={{ paddingLeft: 38, paddingRight: 38 }}
                                    placeholder="Repite la contraseña"
                                    value={passwordForm.confirmar}
                                    onChange={e => setPasswordForm(f => ({ ...f, confirmar: e.target.value }))}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmar(v => !v)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sys-text-light)', padding: 0, display: 'flex' }}
                                >
                                    {showConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        {/* Indicador de coincidencia */}
                        {passwordForm.confirmar && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: passwordForm.nueva === passwordForm.confirmar ? 'var(--sys-success)' : 'var(--sys-danger-text)' }}>
                                {passwordForm.nueva === passwordForm.confirmar ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                            </div>
                        )}
                        <button
                            className="btn btn-danger"
                            onClick={handleCambiarPassword}
                            disabled={isSavingPassword || !passwordForm.nueva || !passwordForm.confirmar}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                        >
                            <Lock size={14} />
                            {isSavingPassword ? 'Actualizando...' : 'Actualizar Contraseña'}
                        </button>
                    </div>
                </div>

                {/* Actividad Reciente */}
                <div className="card card-context context-info animate-fade-in-up" style={{ marginTop: 20, animationDelay: '0.25s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                        <Clock size={18} style={{ color: 'var(--sys-primary)' }} />
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                            Actividad Reciente
                        </h3>
                    </div>

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