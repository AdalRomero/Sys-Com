import { useState, useRef, useEffect } from 'react';
import {
    X,
    ChevronLeft,
    ChevronRight,
    LayoutDashboard,
    PlusCircle,
    ClipboardList,
    History,
    Users,
    BarChart3,
    UserCog,
    Bell,
    User,
    LogOut,
    HelpCircle,
    type LucideIcon,
} from 'lucide-react';

interface HelpStep {
    icon: LucideIcon;
    title: string;
    description: string;
    area: 'sidebar' | 'header';
}

const helpSteps: HelpStep[] = [
    {
        icon: LayoutDashboard,
        title: 'Inicio (Dashboard)',
        description: 'Tu panel principal. Aquí encontrarás un resumen general del estado de las órdenes de servicio, métricas clave y accesos rápidos a las acciones más utilizadas.',
        area: 'sidebar',
    },
    {
        icon: PlusCircle,
        title: 'Nueva Orden',
        description: 'Crea una nueva orden de servicio. Completa los datos del cliente, la descripción del equipo o problema, y asigna prioridad y técnico responsable.',
        area: 'sidebar',
    },
    {
        icon: ClipboardList,
        title: 'Órdenes Pendientes',
        description: 'Visualiza todas las órdenes de servicio que aún no han sido cerradas. Puedes filtrar por estado, prioridad o técnico asignado y acceder al detalle de cada una.',
        area: 'sidebar',
    },
    {
        icon: History,
        title: 'Historial de Órdenes',
        description: 'Consulta el registro completo de todas las órdenes de servicio, incluyendo las cerradas. Útil para auditoría, seguimiento y referencia de trabajos anteriores.',
        area: 'sidebar',
    },
    {
        icon: Users,
        title: 'Clientes',
        description: 'Gestiona tu base de datos de clientes. Agrega nuevos clientes, consulta su información de contacto y revisa el historial de órdenes asociadas a cada uno.',
        area: 'sidebar',
    },
    {
        icon: UserCog,
        title: 'Personal',
        description: 'Administra los usuarios del sistema (técnicos, administrativos). Crea nuevas cuentas, edita permisos y consulta la actividad de cada miembro del equipo.',
        area: 'sidebar',
    },
    {
        icon: BarChart3,
        title: 'Reportes',
        description: 'Genera reportes estadísticos sobre las órdenes de servicio, rendimiento del personal, tiempos de respuesta y más. Exporta los datos para análisis externo.',
        area: 'sidebar',
    },
    {
        icon: Bell,
        title: 'Notificaciones',
        description: 'El icono de campana en la barra superior muestra alertas del sistema: nuevas órdenes asignadas, recordatorios de mantenimiento y avisos importantes. Puedes marcarlas como leídas, completadas o eliminarlas.',
        area: 'header',
    },
    {
        icon: User,
        title: 'Perfil de Usuario',
        description: 'Desde el icono de usuario en la barra superior accedes a tu información personal, configuración de cuenta y la opción para modificar tus datos de perfil.',
        area: 'header',
    },
    {
        icon: LogOut,
        title: 'Cerrar Sesión',
        description: 'Finaliza tu sesión de forma segura. Siempre cierra sesión al terminar de usar el sistema, especialmente en equipos compartidos.',
        area: 'sidebar',
    },
];

interface InformationCardProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function InformationCard({ isOpen, onClose }: InformationCardProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) setCurrentStep(0);
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const step = helpSteps[currentStep];
    const Icon = step.icon;
    const totalSteps = helpSteps.length;
    const isFirst = currentStep === 0;
    const isLast = currentStep === totalSteps - 1;

    const areaLabel = step.area === 'sidebar' ? 'Menú lateral' : 'Barra superior';
    const areaColor = step.area === 'sidebar' ? 'var(--sys-primary)' : 'var(--sys-warning)';

    return (
        <div
            ref={panelRef}
            style={{
                position: 'fixed',
                bottom: 80,
                left: 80,
                width: 340,
                background: 'var(--sys-surface)',
                borderRadius: 'var(--sys-radius-lg)',
                boxShadow: 'var(--sys-shadow-lg)',
                border: '1px solid var(--sys-border)',
                zIndex: 100,
                overflow: 'hidden',
                animation: 'fadeInUp 0.25s ease-out',
            }}
        >
            {/* Header */}
            <div style={{
                padding: '16px',
                borderBottom: '1px solid var(--sys-border-light)',
                background: 'var(--sys-surface-tint)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HelpCircle size={18} style={{ color: 'var(--sys-primary)' }} />
                    <h3 style={{ margin: 0, fontWeight: 600, color: 'var(--sys-text-dark)', fontSize: 15 }}>
                        Guía rápida
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--sys-text-muted)',
                        padding: 4,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.2s',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--sys-text-dark)'}
                    onMouseOut={(e) => e.currentTarget.style.color = 'var(--sys-text-muted)'}
                    aria-label="Cerrar ayuda"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Contenido del paso */}
            <div style={{ padding: '24px 20px 16px' }}>
                {/* Icono del paso */}
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'var(--sys-surface-tint)',
                    border: `2px solid ${areaColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                }}>
                    <Icon size={22} style={{ color: areaColor }} />
                </div>

                {/* Badge del área */}
                <span style={{
                    display: 'inline-block',
                    fontSize: 11,
                    fontWeight: 600,
                    color: areaColor,
                    background: `color-mix(in srgb, ${areaColor} 12%, transparent)`,
                    padding: '3px 10px',
                    borderRadius: 20,
                    marginBottom: 10,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                }}>
                    {areaLabel}
                </span>

                <h4 style={{
                    margin: '0 0 8px',
                    fontWeight: 600,
                    color: 'var(--sys-text-dark)',
                    fontSize: 16,
                }}>
                    {step.title}
                </h4>
                <p style={{
                    margin: 0,
                    color: 'var(--sys-text-muted)',
                    fontSize: 13,
                    lineHeight: 1.55,
                }}>
                    {step.description}
                </p>
            </div>

            {/* Footer con navegación */}
            <div style={{
                padding: '12px 20px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--sys-border-light)',
            }}>
                {/* Indicadores de progreso */}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {helpSteps.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentStep(i)}
                            style={{
                                width: i === currentStep ? 18 : 7,
                                height: 7,
                                borderRadius: 4,
                                background: i === currentStep ? 'var(--sys-primary)' : 'var(--sys-border)',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                transition: 'all 0.3s ease',
                            }}
                            aria-label={`Ir al paso ${i + 1}`}
                        />
                    ))}
                </div>

                {/* Botones de navegación */}
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        onClick={() => setCurrentStep(prev => prev - 1)}
                        disabled={isFirst}
                        style={{
                            background: 'var(--sys-surface-tint)',
                            border: '1px solid var(--sys-border-light)',
                            padding: '6px 8px',
                            borderRadius: 6,
                            cursor: isFirst ? 'not-allowed' : 'pointer',
                            color: isFirst ? 'var(--sys-border)' : 'var(--sys-text-base)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            opacity: isFirst ? 0.5 : 1,
                        }}
                        aria-label="Paso anterior"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={() => isLast ? onClose() : setCurrentStep(prev => prev + 1)}
                        style={{
                            background: isLast ? 'var(--sys-primary)' : 'var(--sys-surface-tint)',
                            border: isLast ? 'none' : '1px solid var(--sys-border-light)',
                            padding: '6px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            color: isLast ? 'var(--sys-bg-white)' : 'var(--sys-text-base)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            fontSize: 13,
                            fontWeight: 500,
                            transition: 'all 0.2s',
                        }}
                        aria-label={isLast ? 'Cerrar guía' : 'Siguiente paso'}
                    >
                        {isLast ? 'Entendido' : <><span>Siguiente</span><ChevronRight size={14} /></>}
                    </button>
                </div>
            </div>

            {/* Animación CSS inyectada */}
            <style>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}
