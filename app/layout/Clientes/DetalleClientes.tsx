import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSecureParams } from '../../../src/hooks/useSecureParams';
import {
    ArrowLeft, Edit3, Save, X, Mail, Phone, MapPin, Building,
    AlertCircle, Briefcase, UserCheck, Link2
} from 'lucide-react';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormSelect from '../../components/FormSelect';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { getClienteById, updateCliente, getEmpresas } from '../../../src/service/clientes.service';
import { useRealtimeClientes, useRealtimeEmpresas } from '../../../src/hooks/realtime';
import type { Cliente } from '../../../src/types';

interface Empresa {
    id_empresa: string;
    nombre: string;
    correo?: string;
    lada?: string;
    telefono?: string;
    direccion?: string;
}

// Forma editable del cliente (subconjunto de Cliente que sí se edita en este form)
type ClienteFormData = {
    nombre: string;
    correo: string;
    lada: string;
    telefono: string;
    direccion: string;
    id_empresa: string; // '' = sin empresa asignada
};

const toFormData = (cliente: Cliente): ClienteFormData => ({
    nombre: cliente.nombre ?? '',
    correo: cliente.correo ?? '',
    lada: cliente.lada ?? '',
    telefono: cliente.telefono ?? '',
    direccion: cliente.direccion ?? '',
    id_empresa: (cliente as any).id_empresa ?? cliente.empresa?.id_empresa ?? '',
});

export default function DetalleCliente() {
    const { id } = useSecureParams<{ id: string }>();
    const navigate = useNavigate();
    const [enviando, setEnviando] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [clienteOriginal, setClienteOriginal] = useState<Cliente | null>(null);
    const [formData, setFormData] = useState<ClienteFormData | null>(null);
    const [editando, setEditando] = useState(false);

    // Listado de empresas disponibles para asignar/reasignar al cliente
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [cargandoEmpresas, setCargandoEmpresas] = useState(false);

    // Control de versiones (aplica a cualquier cliente, ya no solo a "frecuentes")
    const [esCorreccion, setEsCorreccion] = useState(false);
    const [motivoCambio, setMotivoCambio] = useState('');

    const [modalState, setModalState] = useState({
        success: false,
        error: false,
        errorMessage: '',
        successMessage: ''
    });

    // Activa las suscripciones de realtime para clientes y empresa.
    // No hacen nada por sí solas: solo emiten 'refetch-clientes' /
    // 'refetch-empresas' en window cuando algo cambia en Supabase.
    useRealtimeClientes();
    useRealtimeEmpresas();

    const fetchCliente = useCallback(async () => {
        if (!id) return;

        try {
            const cliente = await getClienteById(id);
            if (cliente) {
                setClienteOriginal(cliente as Cliente);
                // No pisamos formData si el usuario está editando, para no
                // perderle cambios en curso por una actualización remota.
                setFormData((prev) => (editando && prev ? prev : toFormData(cliente as Cliente)));
            }
        } catch (err) {
            console.error("Error al cargar perfil de cliente", err);
        }
    }, [id, editando]);

    const fetchEmpresas = useCallback(async () => {
        setCargandoEmpresas(true);
        try {
            const data = await getEmpresas();
            setEmpresas((data as any[]) || []);
        } finally {
            setCargandoEmpresas(false);
        }
    }, []);

    // Carga inicial del cliente
    useEffect(() => {
        setIsLoading(true);
        fetchCliente().finally(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Carga el listado de empresas solo cuando se entra en modo edición
    // (igual que en NuevoCliente, para no pedirlo si el usuario solo está viendo).
    useEffect(() => {
        if (!editando) return;
        if (empresas.length > 0) return;
        fetchEmpresas();
    }, [editando, empresas.length, fetchEmpresas]);

    // Reacciona a cambios de otros usuarios: si este cliente (o cualquier
    // cliente) cambió en la base, recargamos sus datos. Si la lista de
    // empresas cambió, la recargamos solo si está visible (modo edición).
    useEffect(() => {
        const onClientesChange = () => fetchCliente();
        const onEmpresasChange = () => {
            if (editando) fetchEmpresas();
        };

        window.addEventListener('refetch-clientes', onClientesChange);
        window.addEventListener('refetch-empresas', onEmpresasChange);
        return () => {
            window.removeEventListener('refetch-clientes', onClientesChange);
            window.removeEventListener('refetch-empresas', onEmpresasChange);
        };
    }, [fetchCliente, fetchEmpresas, editando]);

    if (isLoading) {
        return (
            <>
                <Header title="Detalles del Cliente" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <p style={{ color: 'var(--sys-text-muted)' }}>Cargando cliente...</p>
                </div>
            </>
        );
    }

    if (!clienteOriginal || !formData) {
        return (
            <>
                <Header title="Detalles del Cliente" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <AlertCircle size={48} style={{ color: 'var(--sys-text-light)', marginBottom: 16 }} />
                    <h2 style={{ color: 'var(--sys-text-dark)' }}>Cliente no encontrado</h2>
                    <p style={{ color: 'var(--sys-text-muted)' }}>El cliente solicitado no existe en el sistema.</p>
                    <button className="btn btn-primary" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> Regresar
                    </button>
                </div>
            </>
        );
    }

    const handleChange = (field: keyof ClienteFormData) => (value: string) => {
        setFormData((prev) => prev ? { ...prev, [field]: value } : prev);
    };

    const handleGuardar = async () => {
        if (!id) return;
        if (enviando) return;

        if (!formData.nombre.trim() || !formData.correo.trim()) {
            setModalState({ ...modalState, error: true, errorMessage: 'El nombre y el correo son obligatorios para el cliente.' });
            return;
        }
        if (!esCorreccion && !motivoCambio.trim()) {
            setModalState({ ...modalState, error: true, errorMessage: 'Debe especificar un motivo de cambio si no es una corrección.' });
            return;
        }


        const { id_empresa, ...camposTexto } = formData;

        const payloadLimpio: Record<string, any> = Object.fromEntries(
            Object.entries(camposTexto).filter(([, value]) => (value as string).trim() !== '')
        );

        const empresaOriginalId = (clienteOriginal as any).id_empresa ?? clienteOriginal.empresa?.id_empresa ?? '';
        if (id_empresa !== empresaOriginalId) {
            payloadLimpio.id_empresa = id_empresa === '' ? null : id_empresa;
        }

        setEnviando(true);

        const res = await updateCliente(id, payloadLimpio, clienteOriginal, esCorreccion, motivoCambio);

        if (res.success) {
            setModalState({
                ...modalState,
                success: true,
                successMessage: 'Edición de cliente realizada exitosamente.'
            });
            setEditando(false);
            setMotivoCambio('');
            setEsCorreccion(false);
            // El realtime debería traer la versión actualizada solo, pero
            // por si el evento tarda o se pierde, forzamos una recarga.
            fetchCliente();
        } else {
            setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error al actualizar.' });
        }
        setEnviando(false);
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

    // Mientras se edita, la empresa "vigente" a mostrar es la seleccionada en el
    // formulario (puede diferir de la original si el usuario la está cambiando).
    const empresaSeleccionada = editando
        ? empresas.find((e) => e.id_empresa === formData.id_empresa) ?? null
        : null;
    const empresaInfo = editando ? empresaSeleccionada : clienteOriginal.empresa ?? null;
    const tieneEmpresa = !!empresaInfo;

    return (
        <>
            <Header title="Detalle de Cliente" />
            <div className="app-content">

                {/* === HEADER DEL DETALLE === */}
                <div className="page-heading">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                            style={{
                                width: 48, height: 48, borderRadius: 8,
                                backgroundColor: tieneEmpresa ? 'var(--sys-primary)' : 'var(--sys-info)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-bg-white)'
                            }}
                        >
                            {tieneEmpresa ? <Building size={24} /> : <UserCheck size={24} />}
                        </div>
                        <div>
                            <h1 style={{ margin: 0 }}>
                                {formData.nombre || '—'}
                            </h1>
                            {tieneEmpresa && (
                                <span className="badge badge-primary" style={{ marginTop: 4 }}>
                                    {empresaInfo!.nombre}
                                </span>
                            )}
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
                                    setFormData(toFormData(clienteOriginal));
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
                                        <InfoItem label="Nombre" value={formData.nombre} icon={UserCheck} />
                                        <InfoItem label="Correo" value={formData.correo} icon={Mail} />
                                        <InfoItem label="Teléfono" value={formData.lada ? `+${formData.lada} ${formData.telefono}` : formData.telefono} icon={Phone} />
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <InfoItem label="Dirección" value={formData.direccion} icon={MapPin} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="form-grid-2">
                                        <FormInput label="Nombre" value={formData.nombre} onChange={handleChange('nombre')} required id="edit-nombre" />
                                        <FormInput label="Correo Electrónico" value={formData.correo} onChange={handleChange('correo')} type="email" required id="edit-correo" />
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div style={{ width: 90 }}><FormInput label="Lada" value={formData.lada} onChange={handleChange('lada')} id="edit-lada" /></div>
                                            <div style={{ flex: 1 }}><FormInput label="Teléfono" value={formData.telefono} onChange={handleChange('telefono')} id="edit-telefono" /></div>
                                        </div>
                                        <FormInput label="Dirección" value={formData.direccion} onChange={handleChange('direccion')} id="edit-direccion" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* EMPRESA ASOCIADA — asignar/reasignar en edición, o solo ver su info */}
                        <div className="card animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--sys-border)' }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sys-text-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Link2 size={18} style={{ color: 'var(--sys-primary)' }} /> Empresa Asociada
                                </h3>
                            </div>
                            <div style={{ padding: '20px' }}>
                                {editando ? (
                                    <>
                                        <FormSelect
                                            label="Vincular a Empresa"
                                            value={formData.id_empresa}
                                            onChange={(v) => handleChange('id_empresa')(v)}
                                            id="edit-empresa"
                                            options={[
                                                { value: '', label: cargandoEmpresas ? 'Cargando empresas...' : 'Ninguna' },
                                                ...empresas.map((emp) => ({ value: emp.id_empresa, label: emp.nombre })),
                                            ]}
                                        />
                                        {empresaSeleccionada && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--sys-border)' }}>
                                                <InfoItem label="Correo" value={empresaSeleccionada.correo || ''} icon={Mail} />
                                                <InfoItem label="Teléfono" value={empresaSeleccionada.lada ? `+${empresaSeleccionada.lada} ${empresaSeleccionada.telefono ?? ''}` : (empresaSeleccionada.telefono ?? '')} icon={Phone} />
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <InfoItem label="Dirección" value={empresaSeleccionada.direccion || ''} icon={MapPin} />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : tieneEmpresa ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px 16px' }}>
                                        <InfoItem label="Nombre" value={empresaInfo!.nombre} icon={Building} />
                                        <InfoItem label="Correo" value={empresaInfo!.correo || ''} icon={Mail} />
                                        <InfoItem label="Teléfono" value={empresaInfo!.lada ? `+${empresaInfo!.lada} ${empresaInfo!.telefono ?? ''}` : (empresaInfo!.telefono ?? '')} icon={Phone} />
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <InfoItem label="Dirección" value={empresaInfo!.direccion || ''} icon={MapPin} />
                                        </div>
                                    </div>
                                ) : (
                                    <p style={{ margin: 0, fontSize: 14, color: 'var(--sys-text-muted)' }}>
                                        Este cliente no está vinculado a ninguna empresa. Presiona "Editar Datos" para asignarle una.
                                    </p>
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
                                            id="es-correccion"
                                            checked={esCorreccion}
                                            onChange={(e) => {
                                                setEsCorreccion(e.target.checked);
                                                if (e.target.checked) setMotivoCambio('Corrección de datos erróneos');
                                                else setMotivoCambio('');
                                            }}
                                            style={{ width: 18, height: 18 }}
                                        />
                                        <label htmlFor="es-correccion" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                                            Es solo una corrección (Ej. error de dedo). No requiere generar nueva versión.
                                        </label>
                                    </div>

                                    {!esCorreccion && (
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="motivo-cambio">Motivo de la actualización <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                id="motivo-cambio"
                                                className="form-input"
                                                placeholder="Ej. Cambio de domicilio, Nuevo número de contacto..."
                                                value={motivoCambio}
                                                onChange={(e) => setMotivoCambio(e.target.value)}
                                                required
                                            />
                                            <span className="form-hint" style={{ marginTop: 4, display: 'block' }}>
                                                Proporcionar un motivo ayudará a entender por qué cambió la información de este cliente a partir de esta fecha.
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
                                label="Tipo de Registro"
                                value={tieneEmpresa ? 'Cliente asociado a empresa' : 'Cliente sin empresa'}
                            />
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--sys-border)' }}>
                                <InfoItem label="Versión Actual" value={`V-${clienteOriginal.version ?? 1}`} />
                            </div>
                            {clienteOriginal.motivo_cambio && (
                                <div style={{ marginTop: 16, padding: '12px', backgroundColor: 'var(--sys-surface-hover)', borderRadius: 8 }}>
                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sys-text-light)', marginBottom: 4 }}>ÚLTIMO MOTIVO DE CAMBIO</span>
                                    <span style={{ fontSize: 13, color: 'var(--sys-text-dark)' }}>"{clienteOriginal.motivo_cambio}"</span>
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