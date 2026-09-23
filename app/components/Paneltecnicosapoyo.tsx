import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideUsers2, Trash2 } from 'lucide-react';
import { getApoyosOrden } from '../../src/service/ordenes.service';
import { eliminarApoyo } from '../../src/service/reasignacion.service';
import { useAuth } from '../../src/context/AuthContext';

interface ApoyadoRow {
    id_apoyo: string;
    id_tecnico: string;
    notas: string | null;
    tecnico_perfil?: {
        nombres: string;
        apellido_paterno: string;
        apellido_materno?: string | null;
    } | null;
}

interface OrdenApoyoInfo {
    id_orden_servicio: string;
    numero_orden: number | string;
    estado?: string;
    responsable?: string | null;
}

interface PanelTecnicosApoyoProps {
    /** Orden sobre la que se muestran los apoyos. `null` cierra el panel. */
    orden: OrdenApoyoInfo | null;
    /** Se llama al cerrar el panel (backdrop, X o botón Cerrar). */
    onClose: () => void;
    /**
     * Modo solo lectura: oculta el botón "Agregar Apoyo" y la opción de
     * remover apoyos. Útil para vistas históricas donde la orden ya está
     * cerrada y solo se quiere consultar quién colaboró.
     */
    readOnly?: boolean;
}

const nombrePerfil = (perfil?: { nombres: string; apellido_paterno: string; apellido_materno?: string | null } | null) =>
    perfil ? `${perfil.nombres} ${perfil.apellido_paterno} ${perfil.apellido_materno ?? ''}`.trim() : '—';

export default function PanelTecnicosApoyo({ orden, onClose, readOnly = false }: PanelTecnicosApoyoProps) {
    const navigate = useNavigate();
    const { perfil } = useAuth();

    const [apoyos, setApoyos] = useState<ApoyadoRow[]>([]);
    const [loadingApoyos, setLoadingApoyos] = useState(false);
    const [eliminando, setEliminando] = useState<string | null>(null);

    // Permisos: Si está en readOnly (historial cerrado, etc) no puede hacer nada.
    // Si no está en readOnly:
    // - administradores y limitados siempre pueden.
    // - minimo SOLO puede si es el responsable directo de la orden.
    const puedeGestionar = !readOnly && (perfil?.rol !== 'minimo' || perfil?.id_perfil_info === orden?.responsable);

    useEffect(() => {
        if (!orden) {
            setApoyos([]);
            return;
        }
        let cancelado = false;
        setLoadingApoyos(true);
        getApoyosOrden(orden.id_orden_servicio).then((data) => {
            if (!cancelado) {
                setApoyos((data as ApoyadoRow[]) ?? []);
                setLoadingApoyos(false);
            }
        });
        return () => { cancelado = true; };
    }, [orden?.id_orden_servicio]);

    const handleEliminarApoyo = async (idApoyo: string) => {
        setEliminando(idApoyo);
        const res = await eliminarApoyo(idApoyo);
        if (res.success) {
            setApoyos(prev => prev.filter(a => a.id_apoyo !== idApoyo));
        } else {
            console.error(res.error);
        }
        setEliminando(null);
    };

    if (!orden) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'var(--sys-backdrop)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 40,
                    animation: 'fadeIn 0.2s ease',
                }}
            />
            {/* Drawer */}
            <div style={{
                position: 'fixed',
                top: 0, right: 0,
                height: '100%',
                width: 400,
                maxWidth: '95vw',
                background: 'linear-gradient(180deg, var(--sys-surface-raised), var(--sys-surface))',
                boxShadow: 'var(--sys-shadow-lg), -4px 0 20px rgba(0,0,0,0.12)',
                border: '1px solid var(--sys-border)',
                borderRight: 'none',
                borderRadius: 'var(--sys-radius-xl) 0 0 var(--sys-radius-xl)',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'fadeInUp 0.25s ease forwards',
            }}>
                {/* Header del panel — estilo app-header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 20px',
                    height: 'var(--sys-header-height)',
                    background: 'linear-gradient(90deg, rgba(47, 125, 246, 0.14), rgba(5, 150, 105, 0.08)), var(--sys-header-bg)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                }}>
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--sys-header-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                            Técnicos de Apoyo
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sys-header-text)' }}>
                            Orden #{orden.numero_orden}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--sys-header-text-muted)', padding: 8, borderRadius: 'var(--sys-radius)',
                            display: 'flex', alignItems: 'center',
                            transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--sys-header-text)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sys-header-text-muted)'; }}
                    >
                    </button>
                </div>

                {/* Info de la orden */}
                <div style={{
                    padding: '14px 20px',
                    background: 'var(--sys-surface-tint)',
                    borderBottom: '1px solid var(--sys-border-light)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: orden.estado === 'en proceso' ? 'var(--sys-info)' : 'var(--sys-warning)',
                        boxShadow: `0 0 0 3px ${orden.estado === 'en proceso' ? 'var(--sys-info-bg)' : 'var(--sys-warning-bg)'}`,
                    }} />
                    {orden.estado && (
                        <>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sys-text-muted)', textTransform: 'capitalize' }}>
                                {orden.estado}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--sys-text-light)' }}>•</span>
                        </>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                        {apoyos.length} {apoyos.length === 1 ? 'técnico asignado' : 'técnicos asignados'}
                    </span>
                </div>

                {/* Contenido */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {loadingApoyos ? (
                        <div style={{ textAlign: 'center', color: 'var(--sys-text-muted)', padding: 40, fontSize: 14 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%', margin: '0 auto 12px',
                                border: '3px solid var(--sys-border-light)',
                                borderTopColor: 'var(--sys-primary)',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            Cargando apoyos...
                        </div>
                    ) : apoyos.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '48px 16px',
                            color: 'var(--sys-text-muted)', fontSize: 14,
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                                background: 'var(--sys-bg)',
                                border: '2px dashed var(--sys-border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <LucideUsers2 size={28} style={{ color: 'var(--sys-text-light)' }} />
                            </div>
                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--sys-text-dark)', marginBottom: 4 }}>Sin técnicos de apoyo</p>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-light)' }}>Esta orden no tiene técnicos de apoyo asignados.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {apoyos.map((apoyo, index) => (
                                <div
                                    key={apoyo.id_apoyo}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '14px 10px',
                                        borderBottom: index < apoyos.length - 1 ? '1px solid var(--sys-border-light)' : 'none',
                                        borderRadius: 'var(--sys-radius)', transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--sys-bg)'; e.currentTarget.style.boxShadow = 'var(--sys-shadow-sm)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    {/* Avatar — estilo avatar-initials */}
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                        background: 'linear-gradient(135deg, var(--sys-primary-bright), var(--sys-primary-deep))',
                                        color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, fontWeight: 700,
                                        boxShadow: '0 8px 16px -10px rgba(26, 86, 219, 0.7)',
                                    }}>
                                        {(apoyo.tecnico_perfil?.nombres?.[0] ?? '?').toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {nombrePerfil(apoyo.tecnico_perfil)}
                                        </div>
                                        {apoyo.notas ? (
                                            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {apoyo.notas}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 12, color: 'var(--sys-text-light)', marginTop: 3, fontStyle: 'italic' }}>
                                                Sin notas
                                            </div>
                                        )}
                                    </div>

                                    {/* Botón eliminar (solo si tiene permisos) */}
                                    {puedeGestionar && (
                                        <button
                                            onClick={() => handleEliminarApoyo(apoyo.id_apoyo)}
                                            disabled={eliminando === apoyo.id_apoyo}
                                            title="Remover apoyo"
                                            className="btn-icon"
                                            style={{
                                                color: eliminando === apoyo.id_apoyo ? 'var(--sys-text-muted)' : 'var(--sys-danger)',
                                                flexShrink: 0,
                                                opacity: eliminando === apoyo.id_apoyo ? 0.5 : 1,
                                            }}
                                            onMouseEnter={e => { if (eliminando !== apoyo.id_apoyo) { e.currentTarget.style.background = 'var(--sys-danger-bg)'; e.currentTarget.style.borderColor = 'var(--sys-danger-border)'; } }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid var(--sys-border)',
                    background: 'var(--sys-surface-tint)',
                    display: 'flex', gap: 10,
                }}>
                    {puedeGestionar && (
                        <button
                            className="btn btn-primary"
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={() => navigate(`/orden/${orden.id_orden_servicio}/reasignar`, { state: { tab: 'apoyo' } })}
                        >
                            <LucideUsers2 size={15} /> Agregar Apoyo
                        </button>
                    )}
                    <button
                        className="btn btn-secondary"
                        style={{ justifyContent: 'center', minWidth: 90, flex: !puedeGestionar ? 1 : undefined }}
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </>
    );
}