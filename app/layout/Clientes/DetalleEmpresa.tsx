import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSecureParams } from '../../../src/hooks/useSecureParams';
import {
    ArrowLeft, Edit3, Save, X, Mail, Phone, MapPin, Building,
    AlertCircle, Briefcase, Link2, Search, UserMinus, UserPlus, Loader2
} from 'lucide-react';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import {
    getEmpresaById,
    updateEmpresa,
    getClientesPorEmpresa,
    getClientesParaAsignar,
    asignarClientesAEmpresa,
} from '../../../src/service/clientes.service';
import { useRealtimeClientes, useRealtimeEmpresas } from '../../../src/hooks/realtime';

interface Empresa {
    id_empresa: string;
    nombre: string;
    correo?: string;
    lada?: string;
    telefono?: string;
    direccion?: string;
    version?: number;
    motivo_cambio?: string;
}

interface ClienteVinculado {
    id_cliente: string;
    nombre: string;
    correo?: string;
    lada?: string;
    telefono?: string;
    activo?: boolean | null;
}

interface ClienteCandidato extends ClienteVinculado {
    id_empresa?: string | null;
}

// Forma editable de la empresa
type EmpresaFormData = {
    nombre: string;
    correo: string;
    lada: string;
    telefono: string;
    direccion: string;
};

const toFormData = (empresa: Empresa): EmpresaFormData => ({
    nombre: empresa.nombre ?? '',
    correo: empresa.correo ?? '',
    lada: empresa.lada ?? '',
    telefono: empresa.telefono ?? '',
    direccion: empresa.direccion ?? '',
});

export default function DetalleEmpresa() {
    const { id } = useSecureParams<{ id: string }>();
    const navigate = useNavigate();
    const [enviando, setEnviando] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [empresaOriginal, setEmpresaOriginal] = useState<Empresa | null>(null);
    const [formData, setFormData] = useState<EmpresaFormData | null>(null);
    const [editando, setEditando] = useState(false);

    // Control de versiones
    const [esCorreccion, setEsCorreccion] = useState(false);
    const [motivoCambio, setMotivoCambio] = useState('');

    // Clientes vinculados a esta empresa
    const [clientesVinculados, setClientesVinculados] = useState<ClienteVinculado[]>([]);
    const [cargandoVinculados, setCargandoVinculados] = useState(false);
    const [desvinculandoId, setDesvinculandoId] = useState<string | null>(null);

    // Panel de "Vincular Clientes": búsqueda + selección múltiple
    const [mostrarVincular, setMostrarVincular] = useState(false);
    const [busquedaAsignar, setBusquedaAsignar] = useState('');
    const [candidatos, setCandidatos] = useState<ClienteCandidato[]>([]);
    const [cargandoCandidatos, setCargandoCandidatos] = useState(false);
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
    const [vinculando, setVinculando] = useState(false);

    const [modalState, setModalState] = useState({
        success: false,
        error: false,
        errorMessage: '',
        successMessage: ''
    });

    // Igual que en DetalleCliente: solo emiten eventos en window,
    // aquí los escuchamos para refrescar empresa y su lista de clientes.
    useRealtimeEmpresas();
    useRealtimeClientes();

    const fetchEmpresa = useCallback(async () => {
        if (!id) return;
        try {
            const empresa = await getEmpresaById(id);
            if (empresa) {
                setEmpresaOriginal(empresa as Empresa);
                setFormData((prev) => (editando && prev ? prev : toFormData(empresa as Empresa)));
            }
        } catch (err) {
            console.error('Error al cargar perfil de empresa', err);
        }
    }, [id, editando]);

    const fetchClientesVinculados = useCallback(async () => {
        if (!id) return;
        setCargandoVinculados(true);
        try {
            const data = await getClientesPorEmpresa(id);
            setClientesVinculados((data as ClienteVinculado[]) || []);
        } finally {
            setCargandoVinculados(false);
        }
    }, [id]);

    // Carga inicial
    useEffect(() => {
        setIsLoading(true);
        Promise.all([fetchEmpresa(), fetchClientesVinculados()]).finally(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Reacciona a cambios remotos
    useEffect(() => {
        const onEmpresasChange = () => fetchEmpresa();
        const onClientesChange = () => fetchClientesVinculados();

        window.addEventListener('refetch-empresas', onEmpresasChange);
        window.addEventListener('refetch-clientes', onClientesChange);
        return () => {
            window.removeEventListener('refetch-empresas', onEmpresasChange);
            window.removeEventListener('refetch-clientes', onClientesChange);
        };
    }, [fetchEmpresa, fetchClientesVinculados]);

    // Búsqueda de candidatos con debounce mientras el panel de vincular está abierto
    useEffect(() => {
        if (!mostrarVincular || !id) return;

        const timer = setTimeout(async () => {
            setCargandoCandidatos(true);
            try {
                const data = await getClientesParaAsignar(id, busquedaAsignar);
                setCandidatos((data as ClienteCandidato[]) || []);
            } finally {
                setCargandoCandidatos(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [mostrarVincular, busquedaAsignar, id]);

    if (isLoading) {
        return (
            <>
                <Header title="Detalles de la Empresa" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <p style={{ color: 'var(--sys-text-muted)' }}>Cargando empresa...</p>
                </div>
            </>
        );
    }

    if (!empresaOriginal || !formData) {
        return (
            <>
                <Header title="Detalles de la Empresa" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <AlertCircle size={48} style={{ color: 'var(--sys-text-light)', marginBottom: 16 }} />
                    <h2 style={{ color: 'var(--sys-text-dark)' }}>Empresa no encontrada</h2>
                    <p style={{ color: 'var(--sys-text-muted)' }}>La empresa solicitada no existe en el sistema.</p>
                    <button className="btn btn-primary" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> Regresar
                    </button>
                </div>
            </>
        );
    }

    const handleChange = (field: keyof EmpresaFormData) => (value: string) => {
        setFormData((prev) => prev ? { ...prev, [field]: value } : prev);
    };

    const handleGuardar = async () => {
        if (!id) return;
        if (enviando) return;

        if (!formData.nombre.trim() || !formData.correo.trim() || !formData.telefono.trim()) {
            setModalState({ ...modalState, error: true, errorMessage: 'El nombre, el correo electrónico y el número telefónico son obligatorios para la empresa.' });
            return;
        }
        if (!esCorreccion && !motivoCambio.trim()) {
            setModalState({ ...modalState, error: true, errorMessage: 'Debe especificar un motivo de cambio si no es una corrección.' });
            return;
        }

        const payloadLimpio: Record<string, any> = Object.fromEntries(
            Object.entries(formData).filter(([, value]) => (value as string).trim() !== '')
        );

        setEnviando(true);
        const res = await updateEmpresa(id, payloadLimpio, empresaOriginal, esCorreccion, motivoCambio);

        if (res.success) {
            setModalState({
                ...modalState,
                success: true,
                successMessage: 'Edición de empresa realizada exitosamente.'
            });
            setEditando(false);
            setMotivoCambio('');
            setEsCorreccion(false);
            fetchEmpresa();
        } else {
            setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error al actualizar.' });
        }
        setEnviando(false);
    };

    const handleDesvincular = async (idCliente: string) => {
        if (desvinculandoId) return;
        setDesvinculandoId(idCliente);
        const res = await asignarClientesAEmpresa([idCliente], null);
        if (res.success) {
            fetchClientesVinculados();
        } else {
            setModalState({ ...modalState, error: true, errorMessage: res.error || 'No se pudo desvincular al cliente.' });
        }
        setDesvinculandoId(null);
    };

    const toggleSeleccion = (idCliente: string) => {
        setSeleccionados((prev) => {
            const next = new Set(prev);
            if (next.has(idCliente)) next.delete(idCliente);
            else next.add(idCliente);
            return next;
        });
    };

    const handleAbrirVincular = () => {
        setMostrarVincular(true);
        setBusquedaAsignar('');
        setSeleccionados(new Set());
    };

    const handleCerrarVincular = () => {
        setMostrarVincular(false);
        setBusquedaAsignar('');
        setCandidatos([]);
        setSeleccionados(new Set());
    };

    const handleVincularSeleccionados = async () => {
        if (!id || seleccionados.size === 0 || vinculando) return;
        setVinculando(true);
        const res = await asignarClientesAEmpresa(Array.from(seleccionados), id);
        if (res.success) {
            setModalState({
                ...modalState,
                success: true,
                successMessage: `${seleccionados.size} cliente(s) vinculado(s) exitosamente.`
            });
            handleCerrarVincular();
            fetchClientesVinculados();
        } else {
            setModalState({ ...modalState, error: true, errorMessage: res.error || 'No se pudieron vincular los clientes seleccionados.' });
        }
        setVinculando(false);
    };

    const InfoItem = ({ label, value, icon: Icon }: { label: string; value: string, icon?: any }) => (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--sys-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {Icon && <Icon size={14} />} {label}
            </div>
            <div style={{ fontSize: 14, color: 'var(--sys-text-dark)', fontWeight: 500 }}>
                {value || '—'}
            </div>
        </div>
    );

    return (
        <>
            <Header title="Detalle de Empresa" />
            <div className="app-content">

                {/* === HEADER DEL DETALLE === */}
                <div className="page-heading">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                            style={{
                                width: 48, height: 48, borderRadius: 8,
                                backgroundColor: 'var(--sys-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-bg-white)'
                            }}
                        >
                            <Building size={24} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0 }}>
                                {formData.nombre || '—'}
                            </h1>
                            <span className="badge badge-primary" style={{ marginTop: 4 }}>
                                {clientesVinculados.length} cliente{clientesVinculados.length !== 1 ? 's' : ''} vinculado{clientesVinculados.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                    <div className="action-bar">
                        <button className="btn btn-primary" onClick={() => navigate(-1)}>
                            <ArrowLeft size={16} /> Regresar
                        </button>
                        {!editando ? (
                            <button className="btn btn-outline-primary" onClick={() => setEditando(true)}>
                                <Edit3 size={16} /> Editar Datos
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-ghost" onClick={() => {
                                    setFormData(toFormData(empresaOriginal));
                                    setEditando(false);
                                }}>
                                    <X size={16} /> Cancelar
                                </button>
                                <button className="btn btn-primary" onClick={handleGuardar} disabled={enviando}>
                                    <Save size={16} /> Guardar Cambios
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* === CUERPO DEL DETALLE === */}
                <div className="grid-layout" style={{ gap: 24, gridTemplateColumns: 'minmax(0, 2fr) 1fr', alignItems: 'start' }}>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* CARTA DE INFORMACIÓN PRINCIPAL */}
                        <div className="card animate-fade-in-up">
                            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--sys-border)', display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sys-text-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Briefcase size={18} style={{ color: 'var(--sys-primary)' }} /> Datos Generales
                                </h3>
                            </div>
                            <div style={{ padding: '20px' }}>
                                {!editando ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px 16px' }}>
                                        <InfoItem label="Nombre" value={formData.nombre} icon={Building} />
                                        <InfoItem label="Correo" value={formData.correo} icon={Mail} />
                                        <InfoItem label="Teléfono" value={formData.lada ? `+${formData.lada} ${formData.telefono}` : formData.telefono} icon={Phone} />
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <InfoItem label="Dirección" value={formData.direccion} icon={MapPin} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="form-grid-2">
                                        <FormInput label="Nombre" value={formData.nombre} onChange={handleChange('nombre')} required id="edit-nombre-empresa" />
                                        <FormInput label="Correo Electrónico" value={formData.correo} onChange={handleChange('correo')} required type="email" id="edit-correo-empresa" />
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div style={{ width: 90 }}><FormInput label="Lada" value={formData.lada} onChange={handleChange('lada')} id="edit-lada-empresa" /></div>
                                            <div style={{ flex: 1 }}><FormInput label="Teléfono" required value={formData.telefono} onChange={handleChange('telefono')} id="edit-telefono-empresa" /></div>
                                        </div>
                                        <FormInput label="Dirección" value={formData.direccion} onChange={handleChange('direccion')} id="edit-direccion-empresa" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CLIENTES VINCULADOS — ver, desvincular, y vincular varios a la vez */}
                        <div className="card animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--sys-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sys-text-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Link2 size={18} style={{ color: 'var(--sys-primary)' }} /> Clientes Vinculados
                                </h3>
                                {!mostrarVincular && (
                                    <button className="btn btn-outline-primary btn-sm" onClick={handleAbrirVincular}>
                                        <UserPlus size={14} /> Vincular Clientes
                                    </button>
                                )}
                            </div>
                            <div style={{ padding: '20px' }}>

                                {/* Panel de búsqueda + selección múltiple */}
                                {mostrarVincular && (
                                    <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px dashed var(--sys-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                            <div style={{ position: 'relative', flex: 1 }}>
                                                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    style={{ paddingLeft: 36 }}
                                                    placeholder="Buscar por nombre o correo..."
                                                    value={busquedaAsignar}
                                                    onChange={(e) => setBusquedaAsignar(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                            <button className="btn btn-ghost btn-sm" onClick={handleCerrarVincular}>
                                                <X size={14} /> Cerrar
                                            </button>
                                        </div>

                                        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--sys-border)', borderRadius: 8 }}>
                                            {cargandoCandidatos ? (
                                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--sys-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                    <Loader2 size={16} className="spin" /> Buscando clientes...
                                                </div>
                                            ) : candidatos.length === 0 ? (
                                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--sys-text-muted)', fontSize: 13 }}>
                                                    {busquedaAsignar ? 'Sin resultados para esa búsqueda.' : 'Escribe para buscar clientes disponibles.'}
                                                </div>
                                            ) : (
                                                candidatos.map((c) => (
                                                    <label
                                                        key={c.id_cliente}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                                            borderBottom: '1px solid var(--sys-border)', cursor: 'pointer',
                                                            backgroundColor: seleccionados.has(c.id_cliente) ? 'var(--sys-surface-hover)' : 'transparent'
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={seleccionados.has(c.id_cliente)}
                                                            onChange={() => toggleSeleccion(c.id_cliente)}
                                                            style={{ width: 16, height: 16 }}
                                                        />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-dark)' }}>{c.nombre}</div>
                                                            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                                                {c.correo}{c.id_empresa ? ' · actualmente en otra empresa' : ''}
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                            <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                                {seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}
                                            </span>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={handleVincularSeleccionados}
                                                disabled={seleccionados.size === 0 || vinculando}
                                            >
                                                <UserPlus size={14} /> {vinculando ? 'Vinculando...' : 'Vincular Seleccionados'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Lista de clientes ya vinculados */}
                                {cargandoVinculados ? (
                                    <p style={{ margin: 0, fontSize: 14, color: 'var(--sys-text-muted)' }}>Cargando clientes...</p>
                                ) : clientesVinculados.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: 14, color: 'var(--sys-text-muted)' }}>
                                        Esta empresa aún no tiene clientes vinculados.
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {clientesVinculados.map((c) => (
                                            <div
                                                key={c.id_cliente}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '10px 12px', border: '1px solid var(--sys-border)', borderRadius: 8,
                                                    opacity: c.activo === false ? 0.5 : 1,
                                                    filter: c.activo === false ? 'grayscale(100%)' : 'none',
                                                    background: c.activo === false ? 'var(--sys-bg)' : 'transparent'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                                                        {c.nombre}
                                                        {c.activo === false && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--sys-text-muted)', marginLeft: 8, textTransform: 'uppercase' }}>Inactivo</span>}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                                        {c.correo}{c.telefono ? ` · ${c.lada ? '+' + c.lada + ' ' : ''}${c.telefono}` : ''}
                                                    </div>
                                                </div>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleDesvincular(c.id_cliente)}
                                                    disabled={desvinculandoId === c.id_cliente}
                                                    title="Desvincular de esta empresa"
                                                >
                                                    <UserMinus size={14} /> {desvinculandoId === c.id_cliente ? 'Quitando...' : 'Desvincular'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SECCIÓN DE CONTROL DE VERSIONES AL EDITAR */}
                        {editando && (
                            <div className="card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                                <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--sys-border)' }}>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sys-text-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        Control de Versiones
                                    </h3>
                                </div>
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                        <input
                                            type="checkbox"
                                            id="es-correccion-empresa"
                                            checked={esCorreccion}
                                            onChange={(e) => {
                                                setEsCorreccion(e.target.checked);
                                                if (e.target.checked) setMotivoCambio('Corrección de datos erróneos');
                                                else setMotivoCambio('');
                                            }}
                                            style={{ width: 18, height: 18 }}
                                        />
                                        <label htmlFor="es-correccion-empresa" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                                            Es solo una corrección (Ej. error de dedo). No requiere generar nueva versión.
                                        </label>
                                    </div>

                                    {!esCorreccion && (
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="motivo-cambio-empresa">Motivo de la actualización <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                id="motivo-cambio-empresa"
                                                className="form-input"
                                                placeholder="Ej. Cambio de domicilio, Nuevo número de contacto..."
                                                value={motivoCambio}
                                                onChange={(e) => setMotivoCambio(e.target.value)}
                                                required
                                            />
                                            <span className="form-hint" style={{ marginTop: 4, display: 'block' }}>
                                                Proporcionar un motivo ayudará a entender por qué cambió la información de esta empresa a partir de esta fecha.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* PANEL LATERAL DERECHO */}
                    <div className="card animate-fade-in-up" style={{ animationDelay: '0.15s', marginTop: 20 }}>
                        <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--sys-border)' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                                Estado Actual
                            </h3>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <InfoItem
                                label="Clientes Vinculados"
                                value={String(clientesVinculados.length)}
                            />
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--sys-border)' }}>
                                <InfoItem label="Versión Actual" value={`V-${empresaOriginal.version ?? 1}`} />
                            </div>
                            {empresaOriginal.motivo_cambio && (
                                <div style={{ marginTop: 16, padding: '12px', backgroundColor: 'var(--sys-surface-hover)', borderRadius: 8 }}>
                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sys-text-light)', marginBottom: 4 }}>ÚLTIMO MOTIVO DE CAMBIO</span>
                                    <span style={{ fontSize: 13, color: 'var(--sys-text-dark)' }}>"{empresaOriginal.motivo_cambio}"</span>
                                </div>
                            )}
                        </div>
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
                onClose={() => {
                    setModalState({ ...modalState, success: false });
                    navigate('/clientes');
                }}
                title="Solicitud Exitosa"
                message={modalState.successMessage}
            />
        </>
    );
}