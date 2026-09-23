import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSecureParams } from '../../../src/hooks/useSecureParams';
import { ArrowLeft, Save, UserCheck, UserCog, AlertCircle, Users, X, Plus } from 'lucide-react';
import { useAuth } from '../../../src/context/AuthContext';
import Header from '../../components/Header';
import FormSelect from '../../components/FormSelect';
import FormTextarea from '../../components/FormTextarea';
import FormInput from '../../components/FormInput';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { getOrdenById } from '../../../src/service/ordenes.service';
import { reasignarResponsable, agregarApoyoOrden } from '../../../src/service/reasignacion.service';
import { getTecnicos } from '../../../src/service/usuarios.service';
import type { Orden } from '../../../src/types';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';

interface Tecnico { id: string; nombre: string; }

// ─── helpers ────────────────────────────────────────────────────────────────

const nombrePerfil = (
    perfil?: { nombres: string; apellido_paterno: string; apellido_materno?: string } | null
) => perfil
        ? `${perfil.nombres} ${perfil.apellido_paterno} ${perfil.apellido_materno ?? ''}`.trim()
        : null;

const nombreCliente = (cliente?: Orden['cliente']) =>
    cliente?.empresa?.nombre ?? cliente?.nombre ?? null;

const iniciales = (nombre?: string | null) => {
    if (!nombre) return '?';
    const partes = nombre.trim().split(/\s+/);
    return (partes[0]?.[0] ?? '').concat(partes[1]?.[0] ?? '').toUpperCase();
};

export default function ReasignarOrden() {
    const { id } = useSecureParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { perfil } = useAuth();
    const tabInicial: 'reasignar' | 'apoyo' = location.state?.tab === 'apoyo' ? 'apoyo' : 'reasignar';

    const [isLoading, setIsLoading] = useState(true);
    const [orden, setOrden] = useState<Orden | null>(null);
    const [listaTecnicos, setListaTecnicos] = useState<Tecnico[]>([]);
    const [enviando, setEnviando] = useState(false);

    const [activeTab, setActiveTab] = useState<'reasignar' | 'apoyo'>(tabInicial);

    const [formData, setFormData] = useState({
        nuevoTecnico: '',
        notaTraspaso: '',
        notaApoyo: '',
        apoyos: [] as { id_tecnico: string; rol_apoyo: string }[],
    });

    const [apoyoActual, setApoyoActual] = useState({ id_tecnico: '', rol_apoyo: '' });

    const [modalState, setModalState] = useState({
        success: false,
        error: false,
        errorMessage: '',
        successMessage: '',
    });

    useEffect(() => {
        const fetchDetalle = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const [ordenRes, tecnicosRes] = await Promise.all([
                    getOrdenById(id),
                    getTecnicos(),
                ]);
                
                // Si la orden existe, validar que el usuario pueda gestionarla
                if (ordenRes) {
                    const esResponsable = perfil?.id_perfil_info === ordenRes.responsable;
                    if (perfil?.rol === 'minimo' && !esResponsable) {
                        // Es apoyo (o un usuario minimo no responsable) intentando entrar a reasignar
                        navigate('/dashboard');
                        return;
                    }
                }

                setOrden(ordenRes);
                setListaTecnicos(tecnicosRes);
            } catch (err) {
                console.error('Error al cargar orden', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetalle();
    }, [id]);

    const handleChange = (field: keyof typeof formData) => (value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleAddApoyo = () => {
        if (!apoyoActual.id_tecnico) return;
        if (formData.apoyos.some(a => a.id_tecnico === apoyoActual.id_tecnico)) {
            setModalState({ ...modalState, error: true, errorMessage: 'El técnico ya está en la lista de apoyos.' });
            return;
        }
        if (apoyoActual.id_tecnico === formData.nuevoTecnico) {
            setModalState({ ...modalState, error: true, errorMessage: 'El técnico de apoyo no puede ser el mismo que el nuevo responsable.' });
            return;
        }
        setFormData(prev => ({
            ...prev,
            apoyos: [...prev.apoyos, { ...apoyoActual }]
        }));
        setApoyoActual({ id_tecnico: '', rol_apoyo: '' });
    };

    const handleRemoveApoyo = (idTecnico: string) => {
        setFormData(prev => ({
            ...prev,
            apoyos: prev.apoyos.filter(a => a.id_tecnico !== idTecnico)
        }));
    };

    const tecnicoNuevo = listaTecnicos.find(t => t.id === formData.nuevoTecnico) ?? null;
    const esMismoTecnico = !!formData.nuevoTecnico && formData.nuevoTecnico === orden?.responsable;
    const hayReasignacion = !!formData.nuevoTecnico && !esMismoTecnico;
    const hayApoyos = formData.apoyos.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (enviando || !orden) return;

        setEnviando(true);
        let res;

        if (activeTab === 'reasignar') {
            if (esMismoTecnico) {
                setModalState({ ...modalState, error: true, errorMessage: 'El técnico seleccionado ya es el responsable actual de esta orden.' });
                setEnviando(false);
                return;
            }
            if (!hayReasignacion) {
                setModalState({ ...modalState, error: true, errorMessage: 'Debes seleccionar a un nuevo responsable.' });
                setEnviando(false);
                return;
            }
            if (!formData.notaTraspaso.trim()) {
                setModalState({ ...modalState, error: true, errorMessage: 'La nota de traspaso es obligatoria.' });
                setEnviando(false);
                return;
            }

            res = await reasignarResponsable(
                orden.id_orden_servicio,
                orden.responsable ?? null,
                formData.nuevoTecnico,
                formData.notaTraspaso,
                perfil?.id_perfil_info || ''
            );
        } else {
            if (!hayApoyos) {
                setModalState({ ...modalState, error: true, errorMessage: 'Debes agregar al menos un técnico de apoyo.' });
                setEnviando(false);
                return;
            }
            if (!formData.notaApoyo.trim()) {
                setModalState({ ...modalState, error: true, errorMessage: 'La nota es obligatoria al agregar apoyos.' });
                setEnviando(false);
                return;
            }

            res = await agregarApoyoOrden(
                orden.id_orden_servicio,
                formData.apoyos,
                formData.notaApoyo,
                perfil?.id_perfil_info || ''
            );
        }

        if (res.success) {
            setModalState({
                ...modalState,
                success: true,
                successMessage: activeTab === 'reasignar'
                    ? 'Orden reasignada exitosamente.'
                    : 'Apoyos agregados exitosamente a la orden.',
            });
        } else {
            setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error al guardar los cambios.' });
        }

        setEnviando(false);
    };

    const handleSuccessClose = () => {
        setModalState({ ...modalState, success: false });
        navigate(-1);
    };

    if (isLoading) {
        return (
            <>
                <Header title="Reasignar Orden" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <p style={{ color: 'var(--sys-text-muted)' }}>Cargando información de la orden...</p>
                </div>
            </>
        );
    }

    if (!orden) {
        return (
            <>
                <Header title="Reasignar Orden" />
                <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <AlertCircle size={48} style={{ color: 'var(--sys-text-light)', marginBottom: 16 }} />
                    <h2 style={{ color: 'var(--sys-text-dark)' }}>Orden no encontrada</h2>
                    <button className="btn btn-primary" onClick={() => navigate('/ordenes-pendientes')}>
                        <ArrowLeft size={16} /> Regresar
                    </button>
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="Reasignar Orden" />
            <div className="app-content">
                {/* Encabezado */}
                <div className="page-heading">
                    <div>
                        <h1>Administrar Responsables De Orden #{orden.numero_orden}</h1>
                        <p>Cambia el técnico responsable o agrega apoyos. Selecciona la pestaña correspondiente.</p>
                    </div>
                    <div className="action-bar">
                        <button className="btn btn-primary" onClick={() => navigate(-1)}>
                            <ArrowLeft size={16} /> Regresar
                        </button>
                    </div>
                </div>

                {/* Resumen de la orden */}
                <div className="card card-context context-info" style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 16px' }}>
                        Resumen de la Orden
                    </h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: 16,
                    }}>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Folio</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sys-primary)' }}>{orden.numero_orden}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Cliente</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{nombreCliente(orden.cliente) ?? '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Equipo</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{orden.equipo}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Estado</div>
                            <StatusBadge estado={orden.estado} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Prioridad</div>
                            <PriorityBadge prioridad={orden.prioridad} />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--sys-border)', paddingBottom: '16px' }}>
                    <button
                        type="button"
                        className={`btn ${activeTab === 'reasignar' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('reasignar')}
                    >
                        <UserCheck size={16} /> Reasignar Responsable
                    </button>
                    <button
                        type="button"
                        className={`btn ${activeTab === 'apoyo' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('apoyo')}
                    >
                        <Users size={16} /> Técnicos de Apoyo
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {activeTab === 'reasignar' && (
                        <div className="tab-pane">
                            <div className="content-grid-two" style={{ marginBottom: 20 }}>
                                {/* Técnico actual */}
                                <div className="card card-context context-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <UserCheck size={18} style={{ color: 'var(--sys-primary)' }} />
                                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                                            Técnico Actual
                                        </h3>
                                    </div>
                                    {orden.responsable_perfil ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{
                                                width: 44, height: 44, borderRadius: '50%',
                                                background: 'var(--sys-primary-light)', color: 'var(--sys-primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 15, flexShrink: 0,
                                            }}>
                                                {iniciales(nombrePerfil(orden.responsable_perfil))}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                                                    {nombrePerfil(orden.responsable_perfil)}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                                    Responsable asignado actualmente
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>Sin técnico asignado.</p>
                                    )}
                                </div>

                                {/* Nuevo técnico */}
                                <div className="card card-context context-success">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <UserCog size={18} style={{ color: 'var(--sys-success)' }} />
                                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                                            Nuevo Técnico
                                        </h3>
                                    </div>
                                    <FormSelect
                                        label="Seleccionar nuevo técnico"
                                        value={formData.nuevoTecnico}
                                        onChange={handleChange('nuevoTecnico')}
                                        id="reasignar-tecnico"
                                        options={[
                                            { value: '', label: 'Selecciona...' },
                                            ...listaTecnicos.map(t => ({ value: t.id, label: t.nombre })),
                                        ]}
                                    />
                                    {tecnicoNuevo && !esMismoTecnico && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                                            <div style={{
                                                width: 44, height: 44, borderRadius: '50%',
                                                background: 'var(--sys-success-bg)', color: 'var(--sys-success)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 15, flexShrink: 0,
                                            }}>
                                                {iniciales(tecnicoNuevo.nombre)}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                                                    {tecnicoNuevo.nombre}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                                    Recibirá esta orden
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {esMismoTecnico && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                                            <AlertCircle size={16} style={{ color: 'var(--sys-warning)' }} />
                                            <span style={{ fontSize: 12, color: 'var(--sys-warning)' }}>
                                                Ya es el técnico asignado actualmente.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-section form-section-success">
                                <h3 className="form-section-title">Notas de Traspaso (Obligatorio)</h3>
                                <FormTextarea
                                    label="Observaciones y razones del traspaso"
                                    placeholder="Indica qué se hizo, por qué se reasigna y detalles importantes..."
                                    value={formData.notaTraspaso}
                                    onChange={handleChange('notaTraspaso')}
                                    rows={5}
                                    id="reasignar-notas"
                                    required
                                />
                                <p style={{ fontSize: 12, color: 'var(--sys-text-light)', marginTop: 8 }}>
                                    Esta nota se guardará en el historial de la orden para registro.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'apoyo' && (
                        <div className="tab-pane">
                            <div className="card card-context context-info" style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                    <Users size={18} style={{ color: 'var(--sys-primary)' }} />
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                                        Asignar Técnicos de Apoyo
                                    </h3>
                                </div>
                                <div className="content-grid-two" style={{ alignItems: 'end', marginBottom: 16 }}>
                                    <FormSelect
                                        label="Técnico"
                                        value={apoyoActual.id_tecnico}
                                        onChange={(val) => setApoyoActual(prev => ({ ...prev, id_tecnico: val }))}
                                        id="apoyo-tecnico"
                                        options={[
                                            { value: '', label: 'Selecciona...' },
                                            ...listaTecnicos
                                                .filter(t => t.id !== orden?.responsable)
                                                .map(t => ({ value: t.id, label: t.nombre }))
                                        ]}
                                    />
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                                        <div style={{ flex: 1 }}>
                                            <FormInput
                                                label="Rol / Función"
                                                value={apoyoActual.rol_apoyo}
                                                onChange={(val) => setApoyoActual(prev => ({ ...prev, rol_apoyo: val }))}
                                                placeholder="Ej: Cableado, Configuración..."
                                                id="apoyo-rol"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={handleAddApoyo}
                                            disabled={!apoyoActual.id_tecnico}
                                            style={{ height: 44 }}
                                        >
                                            <Plus size={16} /> Agregar
                                        </button>
                                    </div>
                                </div>

                                {formData.apoyos.length > 0 && (
                                    <div className="table-responsive">
                                        <table className="data-table w-full">
                                            <thead>
                                                <tr>
                                                    <th>Técnico</th>
                                                    <th>Rol / Función</th>
                                                    <th style={{ width: 60, textAlign: 'center' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {formData.apoyos.map(apoyo => {
                                                    const t = listaTecnicos.find(x => x.id === apoyo.id_tecnico);
                                                    return (
                                                        <tr key={apoyo.id_tecnico}>
                                                            <td style={{ fontWeight: 500 }}>{t?.nombre}</td>
                                                            <td>{apoyo.rol_apoyo || '—'}</td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn-icon"
                                                                    style={{ color: 'var(--sys-danger)' }}
                                                                    onClick={() => handleRemoveApoyo(apoyo.id_tecnico)}
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="form-section form-section-info">
                                <h3 className="form-section-title">Notas de Apoyo (Obligatorio)</h3>
                                <FormTextarea
                                    label="Observaciones"
                                    placeholder="Indica qué trabajo realizarán los técnicos de apoyo..."
                                    value={formData.notaApoyo}
                                    onChange={handleChange('notaApoyo')}
                                    rows={5}
                                    id="apoyo-notas"
                                    required
                                />
                                <p style={{ fontSize: 12, color: 'var(--sys-text-light)', marginTop: 8 }}>
                                    Esta nota se guardará en el historial indicando el apoyo solicitado.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Botones */}
                    <div className="action-bar" style={{ paddingBottom: 24 }}>
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn btn-success"
                            disabled={
                                enviando ||
                                (activeTab === 'reasignar' && (!hayReasignacion || esMismoTecnico || !formData.notaTraspaso.trim())) ||
                                (activeTab === 'apoyo' && (!hayApoyos || !formData.notaApoyo.trim()))
                            }
                        >
                            <Save size={16} />
                            {enviando ? 'Guardando...' : `Guardar ${activeTab === 'reasignar' ? 'Reasignación' : 'Apoyos'}`}
                        </button>
                    </div>
                </form>
            </div>

            <ErrorModal
                isOpen={modalState.error}
                onClose={() => setModalState({ ...modalState, error: false })}
                title="Error"
                message={modalState.errorMessage}
            />
            <SuccessModal
                isOpen={modalState.success}
                onClose={handleSuccessClose}
                title="¡Éxito!"
                message={modalState.successMessage}
            />
        </>
    );
}