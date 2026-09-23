import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, Trash2, Eye, Info, AlertTriangle, Check } from 'lucide-react';
import { useAuth } from '../../src/context/AuthContext';
import { useNotificaciones } from '../../src/hooks/useNotificaciones';
import { formatTiempoRelativo } from '../../src/utils/dateFormatter';
import type { Notificacion } from '../../src/types';

import CentroResolucionModal from './CentroResolucionModal';

// Color de acento según urgencia. `prioridad` (cuando existe) manda sobre
// `tipo` porque viene directo de la orden relacionada (baja/media/alto/urgente);
// si no hay prioridad, el `tipo` de la notificación decide el color.
const colorPorUrgencia = (notif: Notificacion): string => {
    if (notif.prioridad === 'urgente') return 'var(--sys-danger)';
    if (notif.prioridad === 'alto') return 'var(--sys-orange, var(--sys-warning))';
    if (notif.prioridad === 'media') return 'var(--sys-warning)';
    if (notif.prioridad === 'baja') return 'var(--sys-success)';
    switch (notif.tipo) {
        case 'alert': return 'var(--sys-danger)';
        case 'warning': return 'var(--sys-warning)';
        case 'success': return 'var(--sys-success)';
        default: return 'var(--sys-primary)';
    }
};

const getIcon = (tipo: Notificacion['tipo']) => {
    switch (tipo) {
        case 'warning': return <AlertTriangle size={18} style={{ color: 'var(--sys-warning)' }} />;
        case 'alert': return <AlertTriangle size={18} style={{ color: 'var(--sys-danger)' }} />;
        case 'success': return <CheckCircle size={18} style={{ color: 'var(--sys-success)' }} />;
        default: return <Info size={18} style={{ color: 'var(--sys-primary)' }} />;
    }
};

// Solo navegamos si sabemos construir una ruta para esa referencia.
const rutaParaReferencia = (notif: Notificacion): string | null => {
    if (!notif.id_referencia) return null;
    if (notif.tabla_referencia === 'orden_servicio') return `/orden/${notif.id_referencia}`;
    if (notif.tabla_referencia === 'perfil_info' || notif.tabla_referencia === 'contacto') return '/perfil';
    return null;
};

const esResoluble = (notif: Notificacion): boolean =>
    notif.tabla_referencia === 'peticion_queue' && !!notif.id_referencia;


export default function NotificationsCard() {
    const { perfil } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [idPeticionAbierta, setIdPeticionAbierta] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const {
        notificaciones,
        isLoading,
        unreadCount,
        marcarLeida,
        marcarCompletada,
        marcarTodasComoLeidas,
        eliminar,
        refetch,
    } = useNotificaciones(perfil?.id_perfil_info);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClickNotificacion = (notif: Notificacion) => {
        if (!notif.is_read) marcarLeida(notif.id_notificacion);

        if (esResoluble(notif)) {
            setIsOpen(false);
            setIdPeticionAbierta(notif.id_referencia);
            return;
        }

        const ruta = rutaParaReferencia(notif);
        if (ruta) {
            setIsOpen(false);
            navigate(ruta);
        }
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
            <button
                className="btn-icon"
                aria-label="Notificaciones"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'relative',
                    background: isOpen ? 'var(--sys-white-a10)' : 'transparent',
                    color: isOpen ? 'var(--sys-header-text)' : 'var(--sys-header-text-muted)'
                }}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        minWidth: 16,
                        height: 16,
                        padding: '0 4px',
                        borderRadius: 8,
                        background: 'var(--sys-danger)',
                        color: 'var(--sys-bg-white)',
                        fontSize: 10,
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid var(--sys-header-bg)',
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    width: 380,
                    background: 'var(--sys-surface)',
                    borderRadius: 'var(--sys-radius-lg)',
                    boxShadow: 'var(--sys-shadow-lg)',
                    border: '1px solid var(--sys-border)',
                    overflow: 'hidden',
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 450,
                }}>
                    {/* Header del panel */}
                    <div style={{
                        padding: '16px',
                        borderBottom: '1px solid var(--sys-border-light)',
                        background: 'var(--sys-surface-tint)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <h3 style={{ margin: 0, fontWeight: 600, color: 'var(--sys-text-dark)', fontSize: 16 }}>
                            Notificaciones
                        </h3>
                        {unreadCount > 0 && (
                            <button
                                style={{
                                    fontSize: 12,
                                    color: 'var(--sys-primary)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}
                                onClick={marcarTodasComoLeidas}
                                onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                            >
                                <Check size={14} />
                                Marcar todas leídas
                            </button>
                        )}
                    </div>

                    {/* Lista de Notificaciones */}
                    <div style={{ overflowY: 'auto', flex: 1, backgroundColor: 'var(--sys-surface)' }}>
                        {isLoading ? (
                            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--sys-text-muted)' }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px',
                                    border: '3px solid var(--sys-border-light)',
                                    borderTopColor: 'var(--sys-primary)',
                                    animation: 'spin 0.8s linear infinite',
                                }} />
                                <p style={{ margin: 0, fontSize: 13 }}>Cargando notificaciones...</p>
                            </div>
                        ) : notificaciones.length === 0 ? (
                            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--sys-text-muted)' }}>
                                <Bell size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>No tienes notificaciones</p>
                                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>Te avisaremos cuando haya novedades.</p>
                            </div>
                        ) : (
                            notificaciones.map((notif) => {
                                const accent = colorPorUrgencia(notif);
                                const clickeable = !!rutaParaReferencia(notif) || esResoluble(notif);
                                return (
                                    <div
                                        key={notif.id_notificacion}
                                        onClick={() => handleClickNotificacion(notif)}
                                        style={{
                                            padding: '14px 16px 14px 13px',
                                            borderBottom: '1px solid var(--sys-border-light)',
                                            borderLeft: `3px solid ${notif.is_read ? 'transparent' : accent}`,
                                            background: notif.is_read ? 'transparent' : 'var(--sys-bg)',
                                            transition: 'background 0.2s',
                                            position: 'relative',
                                            opacity: notif.is_completed ? 0.7 : 1,
                                            cursor: clickeable ? 'pointer' : 'default',
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--sys-bg)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = notif.is_read ? 'transparent' : 'var(--sys-bg)'}
                                    >
                                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                                            <div style={{
                                                marginTop: 2,
                                                background: 'var(--sys-surface-tint)',
                                                padding: 8,
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {getIcon(notif.tipo)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{
                                                    margin: '0 0 6px',
                                                    fontWeight: notif.is_read ? 500 : 600,
                                                    color: 'var(--sys-text-dark)',
                                                    fontSize: 14,
                                                    textDecoration: notif.is_completed ? 'line-through' : 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 8,
                                                }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {notif.titulo}
                                                    </span>
                                                    {!notif.is_read && (
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                                                    )}
                                                </p>
                                                <p style={{
                                                    margin: '0 0 10px',
                                                    color: 'var(--sys-text-muted)',
                                                    fontSize: 13,
                                                    lineHeight: 1.4,
                                                    textDecoration: notif.is_completed ? 'line-through' : 'none'
                                                }}>
                                                    {notif.descripcion}
                                                </p>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', fontWeight: 500 }}>
                                                        {formatTiempoRelativo(notif.created)}
                                                    </span>

                                                    {/* Acciones */}
                                                    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                                                        {!notif.is_read && (
                                                            <button
                                                                onClick={() => marcarLeida(notif.id_notificacion)}
                                                                title="Marcar como vista"
                                                                style={{
                                                                    background: 'var(--sys-surface-tint)',
                                                                    border: '1px solid var(--sys-border-light)',
                                                                    padding: '6px',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    color: 'var(--sys-text-muted)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--sys-primary)'; e.currentTarget.style.borderColor = 'var(--sys-primary)'; }}
                                                                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--sys-text-muted)'; e.currentTarget.style.borderColor = 'var(--sys-border-light)'; }}
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                        )}
                                                        {!notif.is_completed && (
                                                            <button
                                                                onClick={() => marcarCompletada(notif.id_notificacion)}
                                                                title="Marcar como cumplida"
                                                                style={{
                                                                    background: 'var(--sys-surface-tint)',
                                                                    border: '1px solid var(--sys-border-light)',
                                                                    padding: '6px',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    color: 'var(--sys-text-muted)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--sys-success)'; e.currentTarget.style.borderColor = 'var(--sys-success)'; }}
                                                                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--sys-text-muted)'; e.currentTarget.style.borderColor = 'var(--sys-border-light)'; }}
                                                            >
                                                                <CheckCircle size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => eliminar(notif.id_notificacion)}
                                                            title="Eliminar notificación"
                                                            style={{
                                                                background: 'var(--sys-surface-tint)',
                                                                border: '1px solid var(--sys-border-light)',
                                                                padding: '6px',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                color: 'var(--sys-text-muted)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--sys-danger)'; e.currentTarget.style.borderColor = 'var(--sys-danger)'; }}
                                                            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--sys-text-muted)'; e.currentTarget.style.borderColor = 'var(--sys-border-light)'; }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {idPeticionAbierta && (
                <CentroResolucionModal
                    idPeticion={idPeticionAbierta}
                    onClose={() => setIdPeticionAbierta(null)}
                    onResuelto={() => {
                        setIdPeticionAbierta(null);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}
