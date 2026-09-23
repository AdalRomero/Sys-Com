import { useNavigate } from 'react-router-dom';
import { useSecureParams } from '../../../src/hooks/useSecureParams';
import {
  ArrowLeft, Edit3, Printer, CheckCircle, User, Monitor, AlertCircle,
  UserCheck, CheckCircle2, Save, X, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import {
  getOrdenById, getHistorialOrden, updateOrden
} from '../../../src/service/ordenes.service';
import { getClientes } from '../../../src/service/clientes.service';
import { getTecnicos } from '../../../src/service/usuarios.service';
import type { Orden, Cliente, AsignacionOrden } from '../../../src/types';
import { useApoyo } from '../../../src/hooks/useApoyo';
import { useNotas } from '../../../src/hooks/useNotas';
import { formatFecha } from '../../../src/utils/dateFormatter';

import FormInput from '../../components/FormInput';
import FormSelect from '../../components/FormSelect';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { supabase } from '../../../src/utils/supabase';
import WarningModal from '../../components/modals/WarningModal';
import { useEffect, useMemo, useState } from 'react';
import ImprimirOrdenModal from '../../components/ImprimirOrdenModal';
import { useAuth } from '../../../src/context/AuthContext';

interface Tecnico { id: string; nombre: string; }

// ─── helpers ────────────────────────────────────────────────────────────────

const nombrePerfil = (
  perfil?: { nombres: string; apellido_paterno: string; apellido_materno?: string | null } | null
) => perfil
    ? `${perfil.nombres} ${perfil.apellido_paterno} ${perfil.apellido_materno ?? ''}`.trim()
    : null;

interface Cambio {
  etiqueta: string;
  antes?: string;
  despues?: string;
}

const buildCambios = (
  e: any,
  clientesMap: Map<string, string>,
  usuariosMap: Map<string, string>
): Cambio[] => {
  if (e.operacion === 'INSERT') return [{ etiqueta: 'Orden creada' }];
  if (e.operacion === 'DELETE') return [{ etiqueta: 'Orden eliminada' }];

  const antes = e.datos_antes ?? {};
  const despues = e.datos_despues ?? {};
  const campos: string[] = e.campos_cambios ?? [];

  const resultado: Cambio[] = [];

  if (campos.includes('estado') && antes.estado !== despues.estado)
    resultado.push({ etiqueta: 'Estado', antes: antes.estado, despues: despues.estado });

  if (campos.includes('actividad') && antes.actividad !== despues.actividad)
    resultado.push({ etiqueta: 'Actividad', antes: antes.actividad, despues: despues.actividad });

  if (campos.includes('prioridad') && antes.prioridad !== despues.prioridad)
    resultado.push({ etiqueta: 'Prioridad', antes: antes.prioridad, despues: despues.prioridad });

  if (campos.includes('responsable') && antes.responsable !== despues.responsable)
    resultado.push({
      etiqueta: 'Técnico',
      antes: antes.responsable ? (usuariosMap.get(antes.responsable) ?? 'Desconocido') : 'Sin asignar',
      despues: despues.responsable ? (usuariosMap.get(despues.responsable) ?? 'Desconocido') : 'Sin asignar',
    });

  if (campos.includes('equipo') && antes.equipo !== despues.equipo)
    resultado.push({ etiqueta: 'Equipo', antes: antes.equipo, despues: despues.equipo });

  if (campos.includes('id_clientes') && antes.id_clientes !== despues.id_clientes)
    resultado.push({
      etiqueta: 'Cliente',
      antes: antes.id_clientes ? (clientesMap.get(antes.id_clientes) ?? 'Desconocido') : 'Sin cliente',
      despues: despues.id_clientes ? (clientesMap.get(despues.id_clientes) ?? 'Desconocido') : 'Sin cliente',
    });

  // Campos de texto libre — solo etiqueta, sin mostrar el contenido completo
  const etiquetasTexto: Record<string, string> = {
    problema: 'Problema',
    observaciones: 'Observaciones',
  };
  ['problema', 'observaciones'].forEach(campo => {
    if (campos.includes(campo) && antes[campo] !== despues[campo]) {
      resultado.push({
        etiqueta: etiquetasTexto[campo],
        antes: antes[campo] ?? '—',
        despues: despues[campo] ?? '—',
      });
    }
  });

  return resultado.length ? resultado : [{ etiqueta: 'Actualización registrada' }];
};

// ─── tipos de actividad ─────────────────────────────────────────────────────
const ACTIVIDADES = [
  { value: 'oficina', label: 'Oficina' },
  { value: 'domicilio', label: 'Domicilio' },
  { value: 'remoto', label: 'Remoto' },
];

// ────────────────────────────────────────────────────────────────────────────

export default function DetalleOrden() {
  const { id } = useSecureParams<{ id: string }>();
  const navigate = useNavigate();
  const { perfil } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);

  // Permisos basados en el rol del usuario logueado.
  // 'minimo' = técnico de apoyo: solo puede ver, y si es responsable directo, cerrar y procesar.
  // 'administrador' y 'limitado' tienen acceso completo a edición y reasignación.
  const esResponsable    = perfil?.id_perfil_info === orden?.responsable;
  const puedeEditar      = perfil?.rol !== 'minimo';
  const puedeReasignar   = perfil?.rol !== 'minimo' || esResponsable;
  const puedeAgregarApoyo = perfil?.rol !== 'minimo' || esResponsable;
  const puedeBorrar      = perfil?.rol !== 'minimo';

  const { apoyos, loadingApoyos, hasMoreApoyos, fetchApoyos } = useApoyo(id);
  const { notas, loadingNotas, hasMoreNotas, fetchNotas } = useNotas(id);

  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);

  const [listaTecnicos, setListaTecnicos] = useState<Tecnico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tooltipActivo, setTooltipActivo] = useState<{ logId: string; idx: number } | null>(null);
  const [tooltipAsignacion, setTooltipAsignacion] = useState<{ id: string; idx: number } | null>(null);
  const [tooltipNota, setTooltipNota] = useState<{ id: string; idx: number } | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [mostrarEmpresa, setMostrarEmpresa] = useState(false);
  const [modalImprimir, setModalImprimir] = useState(false);

  //Paginación (Cargar más) local para el historial general
  const [limiteHistorial, setLimiteHistorial] = useState(5);
  const ITEMS_POR_CARGA = 5;

  const [modalState, setModalState] = useState({
    success: false, error: false,
    errorMessage: '', successMessage: '',
  });



  // Mapas uuid -> nombre para traducir el historial crudo de auditoria_log
  const clientesMap = useMemo(
    () => new Map(clientes.map(c => [c.id_cliente, c.nombre || 'Sin nombre'])),
    [clientes]
  );
  const usuariosMap = useMemo(
    () => new Map(listaTecnicos.map(t => [t.id, t.nombre])),
    [listaTecnicos]
  );

  // ── construcción del formData inicial ──────────────────────────────────────
  const construirFormData = (o: Orden) => ({
    equipo: o.equipo ?? '',
    problema: o.problema ?? '',
    observaciones: o.observaciones ?? '',
    prioridad: o.prioridad,
    actividad: o.actividad,
    id_cliente: o.id_clientes ?? '',
  });

  // ── carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setIsLoading(true);

    // FASE 1 — carga rápida: solo la orden. Se muestra la pantalla en cuanto llegue.
    getOrdenById(id).then((ordenRes) => {
      setOrden(ordenRes);
      if (ordenRes) setFormData(construirFormData(ordenRes));
      setIsLoading(false);
    }).catch((e) => { console.error(e); setIsLoading(false); });

    // FASE 2 — carga en segundo plano: historial, técnicos y clientes no
    // bloquean el render del detalle. Si están offline simplemente llegan rápido
    // desde el espejo local sin penalizar la pantalla principal.
    Promise.all([
      getHistorialOrden(id),
      getTecnicos(),
      getClientes(),
    ]).then(([historialRes, tecnicos, clientesRes]) => {
      setHistorial(historialRes ?? []);
      setListaTecnicos(tecnicos);
      setClientes(clientesRes as Cliente[]);
    }).catch(console.error);

    fetchApoyos(true);
    fetchNotas(true);

    // ── realtime ──────────────────────────────────────────────────────────────
    const canal = supabase
      .channel(`orden-${id}`)
      // cambios en la orden misma
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orden_servicio', filter: `id_orden_servicio=eq.${id}` },
        async () => {
          const ordenActualizada = await getOrdenById(id);
          if (ordenActualizada) {
            setOrden(ordenActualizada);
            setFormData((prev: any) => prev ? construirFormData(ordenActualizada) : prev);
          }
        }
      )
      // nuevas entradas en el historial
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'auditoria_log', filter: `id_registro=eq.${id}` },
        async () => {
          const nuevoHistorial = await getHistorialOrden(id);
          setHistorial(nuevoHistorial ?? []);
        }
      )
      // nuevos apoyos
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orden_apoyo', filter: `id_orden_servicio=eq.${id}` },
        () => {
          fetchApoyos(true);
        }
      )
      // nuevas notas
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orden_nota', filter: `id_orden_servicio=eq.${id}` },
        () => {
          fetchNotas(true);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [id]);

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleChange = (field: string) => (value: string) =>
    setFormData((prev: any) => prev ? { ...prev, [field]: value } : prev);

  const handleCancelarEdicion = () => {
    if (!orden) return;
    setFormData(construirFormData(orden));
    setEditando(false);
  };

  const handleGuardar = async () => {
    if (enviando || !orden) return;

    if (!formData.id_cliente) {
      setModalState({ ...modalState, error: true, errorMessage: 'Debes seleccionar un cliente.' });
      return;
    }

    setEnviando(true);

    const payload: Record<string, unknown> = {
      equipo: formData.equipo,
      problema: formData.problema,
      observaciones: formData.observaciones ?? null,
      prioridad: formData.prioridad,
      actividad: formData.actividad,
      id_clientes: formData.id_cliente,
    };

    // Originales con las mismas claves para que el diff sea exacto
    const originales: Record<string, unknown> = {
      equipo: orden.equipo ?? '',
      problema: orden.problema ?? '',
      observaciones: orden.observaciones ?? '',
      prioridad: orden.prioridad,
      actividad: orden.actividad,
      id_clientes: orden.id_clientes ?? null,
    };

    const res = await updateOrden(
      orden.id_orden_servicio,
      payload,
      originales,
      'Edición desde detalle de orden'
    );

    if (res.success) {
      const ordenActualizada = await getOrdenById(orden.id_orden_servicio);
      if (ordenActualizada) {
        setOrden(ordenActualizada);
        setFormData(construirFormData(ordenActualizada));
      }
      setModalState({ ...modalState, success: true, successMessage: 'Orden actualizada correctamente.' });
      setEditando(false);
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Error al actualizar la orden.' });
    }

    setEnviando(false);
  };

  const handleBorrarOrden = async () => {
    if (!orden) return;

    const { error } = await supabase.from('peticion_queue').insert({
      operacion: 'delete',
      tabla_destino: 'orden_servicio',
      id_registro: orden.id_orden_servicio,
      motivo_cambio: 'Borrado desde detalle de orden',
      payload: {},
    });

    setConfirmarBorrar(false);

    if (error) {
      setModalState({ ...modalState, error: true, errorMessage: 'No se pudo eliminar la orden.' });
    } else {
      navigate(-1);
    }
  };



  // ── renders de apoyo ───────────────────────────────────────────────────────
  const InfoItem = ({ label, value }: { label: string; value?: string | null }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sys-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--sys-text-dark)', fontWeight: 500 }}>
        {value || '—'}
      </div>
    </div>
  );

  // ── loading / not found ────────────────────────────────────────────────────
  if (isLoading) return (
    <>
      <Header title="Detalle de Orden" />
      <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
        <p style={{ color: 'var(--sys-text-muted)' }}>Cargando información de la orden...</p>
      </div>
    </>
  );

  if (!orden || !formData) return (
    <>
      <Header title="Detalle de Orden" />
      <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
        <AlertCircle size={48} style={{ color: 'var(--sys-text-light)', marginBottom: 16 }} />
        <h2 style={{ color: 'var(--sys-text-dark)' }}>Orden no encontrada</h2>
        <p style={{ color: 'var(--sys-text-muted)' }}>La orden solicitada no existe en el sistema.</p>
        <button className="btn btn-primary" onClick={() => navigate('/ordenes-pendientes')}>
          <ArrowLeft size={16} /> Regresar
        </button>
      </div>
    </>
  );

  // ── render principal ───────────────────────────────────────────────────────
  return (
    <>
      <Header title={`Orden #${orden.numero_orden}`} />
      <div className="app-content">

        {/* Encabezado */}
        <div className="page-heading">
          <div>
            <h1>Detalle de Orden — #{orden.numero_orden}</h1>
            <p>Registrada el {formatFecha(orden.created)}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(-1)}>
                <ArrowLeft size={16} /> Regresar
              </button>
              {editando ? (
                <>
                  <button className="btn btn-outline-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCancelarEdicion} disabled={enviando}>
                    <X size={16} /> Cancelar
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleGuardar} disabled={enviando}>
                    <Save size={16} /> {enviando ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </>
              ) : (
                <>
                  {puedeEditar && (
                    <button className="btn btn-outline-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditando(true)}>
                      <Edit3 size={16} /> Editar
                    </button>
                  )}
                  {puedeBorrar && orden.estado === 'pendiente' && (
                    <button
                      className="btn btn-danger"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setConfirmarBorrar(true)}
                    >
                      <Trash2 size={16} /> Borrar orden
                    </button>
                  )}
                  {orden.estado !== 'finalizado' && (perfil?.rol !== 'minimo' || perfil?.id_perfil_info === orden.responsable) && (
                    <button className="btn btn-outline-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/cerrar-orden/${orden.id_orden_servicio}`)}>
                      <CheckCircle size={16} /> Cerrar orden
                    </button>
                  )}
                </>
              )}
            </div>

            {!editando && (
              <button
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setModalImprimir(true)}
              >
                <Printer size={16} /> Imprimir orden
              </button>
            )}
          </div>
        </div>

        {/* Estado / Prioridad / Actividad */}
        <div className="card card-context context-info" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-muted)' }}>Estado:</span>
            <StatusBadge estado={orden.estado} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-muted)' }}>Prioridad:</span>
            {editando ? (
              <div style={{ minWidth: 160 }}>
                <FormSelect
                  label="" value={formData.prioridad}
                  onChange={handleChange('prioridad')}
                  id="do-prioridad"
                  options={[
                    { value: 'urgente', label: 'Urgente' },
                    { value: 'alto', label: 'Alto' },
                    { value: 'media', label: 'Media' },
                    { value: 'baja', label: 'Baja' },
                  ]}
                />
              </div>
            ) : (
              <PriorityBadge prioridad={orden.prioridad} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-muted)' }}>Actividad:</span>
            {editando ? (
              <div style={{ minWidth: 160 }}>
                <FormSelect
                  label="" value={formData.actividad}
                  onChange={handleChange('actividad')}
                  id="do-actividad"
                  options={ACTIVIDADES}
                />
              </div>
            ) : (
              <span className="badge badge-en-proceso">{orden.actividad}</span>
            )}
          </div>
        </div>

        <div className="content-grid-two">

          {/* ── Cliente ── */}
          <div className="card card-context context-success animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <User size={18} style={{ color: 'var(--sys-primary)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                Cliente
              </h3>
            </div>

            {editando ? (
              <FormSelect
                label="Cliente"
                value={formData.id_cliente}
                onChange={handleChange('id_cliente')}
                id="do-cliente"
                options={[
                  { value: '', label: 'Selecciona un cliente…' },
                  ...clientes.map(c => ({ value: c.id_cliente, label: c.nombre || '(Sin nombre)' })),
                ]}
              />
            ) : (
              <>
                {orden.cliente ? (
                  <>
                    <InfoItem label="Nombre" value={orden.cliente.nombre} />
                    <InfoItem label="Dirección" value={orden.cliente.direccion} />
                    <InfoItem label="Correo" value={orden.cliente.correo} />
                    <InfoItem
                      label="Teléfono"
                      value={`${orden.cliente.lada ? '+' + orden.cliente.lada + ' ' : ''}${orden.cliente.telefono || ''}`}
                    />

                    {orden.cliente.empresa && (
                      <div style={{
                        marginTop: 8, marginBottom: 12,
                        background: 'var(--sys-bg)', borderRadius: 'var(--sys-radius)',
                        border: '1px solid var(--sys-border)',
                        overflow: 'hidden',
                      }}>
                        <button
                          type="button"
                          onClick={() => setMostrarEmpresa(!mostrarEmpresa)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--sys-primary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            textAlign: 'left',
                          }}
                        >
                          <span>Empresa ({orden.cliente.empresa.nombre})</span>
                          {mostrarEmpresa ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {mostrarEmpresa && (
                          <div style={{
                            padding: '4px 12px 12px 12px',
                            borderTop: '1px solid var(--sys-border)',
                          }}>
                            <InfoItem label="Dirección" value={orden.cliente.empresa.direccion} />
                            <InfoItem label="Correo" value={orden.cliente.empresa.correo} />
                            {orden.cliente.empresa.telefono && (
                              <InfoItem
                                label="Teléfono"
                                value={`${orden.cliente.empresa.lada ? '+' + orden.cliente.empresa.lada + ' ' : ''}${orden.cliente.empresa.telefono}`}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>Sin información de cliente.</p>
                )}
              </>
            )}
          </div>

          {/* ── Problema ── */}
          <div className="card card-context context-warning animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <AlertCircle size={18} style={{ color: 'var(--sys-warning)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>Problema Reportado</h3>
            </div>
            {editando ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Problema</label>
                  <textarea className="form-input" rows={3} value={formData.problema}
                    onChange={e => handleChange('problema')(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Observaciones internas</label>
                  <textarea className="form-input" rows={3} value={formData.observaciones ?? ''}
                    onChange={e => handleChange('observaciones')(e.target.value)} />
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--sys-text-base)', lineHeight: 1.6, margin: 0 }}>{orden.problema}</p>
                {orden.observaciones && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--sys-bg)', borderRadius: 'var(--sys-radius)', borderLeft: '3px solid var(--sys-warning)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-warning)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Observaciones internas</div>
                    <p style={{ fontSize: 13, color: 'var(--sys-text-base)', margin: 0, lineHeight: 1.5 }}>{orden.observaciones}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Equipo ── */}
          <div className="card card-context context-info animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Monitor size={18} style={{ color: 'var(--sys-primary)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>Información del Equipo</h3>
            </div>
            {editando
              ? <FormInput label="Equipo" value={formData.equipo} onChange={handleChange('equipo')} id="do-equipo" />
              : <InfoItem label="Equipo" value={orden.equipo} />
            }
          </div>

          {/* ── Asignación ── */}
          <div className="card card-context context-success animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <UserCheck size={18} style={{ color: 'var(--sys-success)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>Asignación</h3>
            </div>

            <InfoItem label="Técnico asignado" value={nombrePerfil(orden.responsable_perfil)} />

            <InfoItem label="Registrado por" value={nombrePerfil(orden.realizado_por_perfil)} />
            {orden.finalized_at && (
              <InfoItem label="Finalizado el" value={formatFecha(orden.finalized_at)} />
            )}

            {orden.estado !== 'finalizado' && (puedeReasignar || puedeAgregarApoyo) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {puedeReasignar && (
                  <button
                    className="btn btn-outline-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => navigate(`/orden/${orden.id_orden_servicio}/reasignar`, { state: { tab: 'reasignar' } })}
                  >
                    Reasignar Técnico
                  </button>
                )}
                {puedeAgregarApoyo && (
                  <button
                    className="btn btn-outline-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => navigate(`/orden/${orden.id_orden_servicio}/reasignar`, { state: { tab: 'apoyo' } })}
                  >
                    Agregar Apoyo
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Historial de Asignaciones + Notas en paralelo ── */}
        <div className="content-grid-two" style={{ marginTop: 20, alignItems: 'start' }}>

          {/* ── Asignaciones y Apoyo ── */}
          <div className="card card-context context-success animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCheck size={18} style={{ color: 'var(--sys-success)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                  Asignaciones y Apoyo
                </h3>
                {apoyos.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--sys-success-bg)', color: 'var(--sys-success)', borderRadius: 10, padding: '1px 8px' }}>
                    {apoyos.length}
                  </span>
                )}
              </div>
            </div>

            {apoyos.length === 0 ? (
              <p style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>No hay asignaciones registradas.</p>
            ) : (() => {
              // Agrupar entradas por tiempo (diferencia < 1 min) y mismo asignador
              const agrupadoAsig: AsignacionOrden[][] = [];
              for (const entry of apoyos) {
                if (agrupadoAsig.length === 0) {
                  agrupadoAsig.push([entry]);
                  continue;
                }
                const lastGroup = agrupadoAsig[agrupadoAsig.length - 1];
                const lastEntry = lastGroup[lastGroup.length - 1];

                const diffMs = Math.abs(new Date(entry.created).getTime() - new Date(lastEntry.created).getTime());
                const mismoUser = entry.realizado_por === lastEntry.realizado_por;

                if (diffMs < 60000 && mismoUser) {
                  lastGroup.push(entry);
                } else {
                  agrupadoAsig.push([entry]);
                }
              }

              return (
                <>
                  <div className="timeline">
                    {agrupadoAsig.map((grupo) => {
                      const firstEntry = grupo[0];
                      const todasLasEtiquetas = grupo.map((asignacion, i) => ({
                        etiqueta: 'Técnico de apoyo',
                        valor: nombrePerfil(asignacion.tecnico_perfil) ?? '—',
                        asignadoPor: asignacion.realizado_por_perfil ? nombrePerfil(asignacion.realizado_por_perfil) : null,
                        notas: asignacion.notas ?? null,
                        entryRef: asignacion,
                        originalIdx: i
                      }));

                      return (
                        <div key={firstEntry.id_apoyo} className="timeline-item">
                          <div className="timeline-dot insert" style={{ background: 'var(--sys-success)' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                                {formatFecha(firstEntry.created)}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--sys-text-light)' }}>
                                {formatFecha(firstEntry.created, true).split(', ')[1]}
                              </span>
                              {firstEntry.realizado_por_perfil && (
                                <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--sys-success-bg)', color: 'var(--sys-success)', borderRadius: 4, padding: '1px 7px' }}>
                                  {nombrePerfil(firstEntry.realizado_por_perfil)}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {todasLasEtiquetas.map((chip) => {
                                  const asignacion = chip.entryRef;
                                  const estaActivo = tooltipAsignacion?.id === asignacion.id_apoyo;
                                  return (
                                    <button
                                      key={asignacion.id_apoyo}
                                      onClick={() => setTooltipAsignacion(estaActivo ? null : { id: asignacion.id_apoyo, idx: 0 })}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        background: estaActivo ? 'var(--sys-success)' : 'var(--sys-bg)',
                                        border: `1px solid ${estaActivo ? 'var(--sys-success)' : 'var(--sys-border)'}`,
                                        borderRadius: 6, padding: '4px 10px',
                                        fontSize: 12, fontWeight: 600,
                                        color: estaActivo ? '#fff' : 'var(--sys-text-muted)',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                      }}
                                    >
                                      {chip.etiqueta}
                                      <span style={{ fontSize: 10, opacity: 0.7 }}>{estaActivo ? ' ▲' : ' ▼'}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {tooltipAsignacion && grupo.some(a => a.id_apoyo === tooltipAsignacion.id) && (() => {
                                const asignacionActiva = grupo.find(a => a.id_apoyo === tooltipAsignacion.id);
                                if (!asignacionActiva) return null;
                                const chip = todasLasEtiquetas.find(c => c.entryRef.id_apoyo === asignacionActiva.id_apoyo);
                                if (!chip) return null;
                                return (
                                  <div style={{
                                    background: 'var(--sys-surface)', border: '1px solid var(--sys-border)',
                                    borderRadius: 8, padding: '12px 16px',
                                    borderLeft: '3px solid var(--sys-success)',
                                  }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-success)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      {chip.etiqueta}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-success)', background: 'var(--sys-success-bg)', borderRadius: 3, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>TÉCNICO</span>
                                        <span style={{ fontSize: 13, color: 'var(--sys-text-dark)', fontWeight: 500 }}>{chip.valor}</span>
                                      </div>
                                      {chip.notas && (
                                        <>
                                          <div style={{ height: 1, background: 'var(--sys-border)' }} />
                                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-text-muted)', background: 'var(--sys-bg)', borderRadius: 3, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>Función</span>
                                            <span style={{ fontSize: 13, color: 'var(--sys-text-base)', fontStyle: 'italic' }}>{chip.notas}</span>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hasMoreApoyos && (
                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                      <button className="btn btn-ghost" onClick={() => fetchApoyos(false)} disabled={loadingApoyos}>
                        {loadingApoyos ? 'Cargando...' : 'Cargar más ↓'}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* ── Notas y Seguimiento ── */}
          <div className="card card-context context-warning animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit3 size={18} style={{ color: 'var(--sys-warning)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                  Notas y Seguimiento
                </h3>
                {notas.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--sys-warning-bg)', color: 'var(--sys-warning)', borderRadius: 10, padding: '1px 8px' }}>
                    {notas.length}
                  </span>
                )}
              </div>
            </div>

            {notas.length === 0 ? (
              <p style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>No hay notas registradas.</p>
            ) : (
              <>
                <div className="timeline">
                  {notas.map((nota) => {
                    const colorTipo = nota.tipo === 'traspaso' ? 'var(--sys-primary)'
                      : nota.tipo === 'apoyo' ? 'var(--sys-success)'
                        : nota.tipo === 'cierre' ? 'var(--sys-danger)'
                          : 'var(--sys-warning)';
                    const bgTipo = nota.tipo === 'traspaso' ? 'var(--sys-primary-light)'
                      : nota.tipo === 'apoyo' ? 'var(--sys-success-bg)'
                        : nota.tipo === 'cierre' ? 'var(--sys-danger-bg)'
                          : 'var(--sys-warning-bg)';

                    const estaActivo = tooltipNota?.id === nota.id_nota;
                    return (
                      <div key={nota.id_nota} className="timeline-item">
                        <div className="timeline-dot" style={{ background: colorTipo }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                              {formatFecha(nota.created)}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--sys-text-light)' }}>
                              {formatFecha(nota.created, true).split(', ')[1]}
                            </span>
                            {nota.realizado_por_perfil && (
                              <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--sys-primary-light)', color: 'var(--sys-primary)', borderRadius: 4, padding: '1px 7px' }}>
                                {nombrePerfil(nota.realizado_por_perfil)}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              <button
                                onClick={() => setTooltipNota(estaActivo ? null : { id: nota.id_nota, idx: 0 })}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  background: estaActivo ? colorTipo : bgTipo,
                                  border: `1px solid ${colorTipo}`,
                                  borderRadius: 6, padding: '4px 10px',
                                  fontSize: 11, fontWeight: 700,
                                  color: estaActivo ? '#fff' : colorTipo,
                                  cursor: 'pointer', transition: 'all 0.15s',
                                  textTransform: 'uppercase',
                                }}
                              >
                                NOTA
                                <span style={{ fontSize: 10, opacity: 0.7 }}>{estaActivo ? ' ▲' : ' ▼'}</span>
                              </button>
                            </div>

                            {estaActivo && (
                              <div style={{
                                background: 'var(--sys-surface)', border: '1px solid var(--sys-border)',
                                borderRadius: 8, padding: '12px 16px',
                                borderLeft: `3px solid ${colorTipo}`,
                              }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: colorTipo, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Detalle de Nota
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: colorTipo, background: bgTipo, borderRadius: 3, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>TIPO</span>
                                    <span style={{ fontSize: 13, color: 'var(--sys-text-dark)', fontWeight: 500, textTransform: 'capitalize' }}>{nota.tipo}</span>
                                  </div>

                                  {nota.tipo === 'traspaso' && (
                                    <>
                                      <div style={{ height: 1, background: 'var(--sys-border)' }} />
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-danger)', background: 'var(--sys-danger-bg)', borderRadius: 3, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>ANTES</span>
                                        <span style={{ fontSize: 13, color: 'var(--sys-text-dark)', textDecoration: 'line-through', opacity: 0.55, wordBreak: 'break-word' }}>
                                          {nota.responsable_antes_perfil ? nombrePerfil(nota.responsable_antes_perfil) : 'Sin asignar'}
                                        </span>
                                      </div>
                                      <div style={{ height: 1, background: 'var(--sys-border)' }} />
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-success)', background: 'var(--sys-success-bg)', borderRadius: 3, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>AHORA</span>
                                        <span style={{ fontSize: 13, color: 'var(--sys-text-dark)', fontWeight: 500, wordBreak: 'break-word' }}>
                                          {nota.responsable_despues_perfil ? nombrePerfil(nota.responsable_despues_perfil) : '—'}
                                        </span>
                                      </div>
                                    </>
                                  )}



                                  {nota.nota && (
                                    <>
                                      <div style={{ height: 1, background: 'var(--sys-border)' }} />
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-text-muted)', background: 'var(--sys-bg)', borderRadius: 3, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>CONTENIDO</span>
                                        <span style={{ fontSize: 13, color: 'var(--sys-text-base)', fontStyle: 'italic', lineHeight: 1.5 }}>“{nota.nota}”</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasMoreNotas && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button className="btn btn-ghost" onClick={() => fetchNotas(false)} disabled={loadingNotas}>
                      {loadingNotas ? 'Cargando...' : 'Cargar más ↓'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {/* ── Historial General ── */}
        <div className="card card-context context-info animate-fade-in-up" style={{ marginTop: 20, animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--sys-primary)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                Historial de Seguimiento
              </h3>
              {historial.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  background: 'var(--sys-primary-light)',
                  color: 'var(--sys-primary)',
                  borderRadius: 10, padding: '1px 8px',
                }}>
                  {historial.length}
                </span>
              )}
            </div>
          </div>

          {historial.length === 0 ? (
            <p style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>Sin registros de seguimiento aún.</p>
          ) : (() => {
            const invertido = [...historial].reverse();

            // Agrupar entradas por tiempo (diferencia < 1 min) y mismo usuario
            const agrupado: any[][] = [];
            for (const entry of invertido) {
              if (agrupado.length === 0) {
                agrupado.push([entry]);
                continue;
              }
              const lastGroup = agrupado[agrupado.length - 1];
              const lastEntry = lastGroup[lastGroup.length - 1];

              const diffMs = Math.abs(new Date(entry.created).getTime() - new Date(lastEntry.created).getTime());
              const mismoUser = entry.realizado_por === lastEntry.realizado_por;

              if (diffMs < 60000 && mismoUser) {
                lastGroup.push(entry);
              } else {
                agrupado.push([entry]);
              }
            }

            const mostrarGrupos = agrupado.slice(0, limiteHistorial);

            return (
              <>
                <div className="timeline">
                  {mostrarGrupos.map((grupo) => {
                    const firstEntry = grupo[0];
                    const todasLasEtiquetas = grupo.flatMap((entry) =>
                      buildCambios(entry, clientesMap, usuariosMap).map((cambio, i) => ({
                        ...cambio,
                        entryRef: entry,
                        originalIdx: i
                      }))
                    );

                    return (
                      <div key={firstEntry.id_log} className="timeline-item">
                        <div className={`timeline-dot ${firstEntry.operacion?.toLowerCase()}`} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-dark)' }}>
                              {formatFecha(firstEntry.created)}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--sys-text-light)' }}>
                              {formatFecha(firstEntry.created, true).split(', ')[1]}
                            </span>
                            {firstEntry.realizado_por && (
                              <span style={{
                                fontSize: 11, fontWeight: 600,
                                background: 'var(--sys-primary-light)',
                                color: 'var(--sys-primary)',
                                borderRadius: 4, padding: '1px 7px',
                              }}>
                                {usuariosMap.get(firstEntry.realizado_por) ?? 'Usuario'}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {todasLasEtiquetas.map((cambio) => {
                                const entry = cambio.entryRef;
                                const i = cambio.originalIdx;
                                const tieneDetalle = cambio.antes !== undefined || cambio.despues !== undefined;
                                const estaActivo = tooltipActivo?.logId === entry.id_log && tooltipActivo?.idx === i;
                                return (
                                  <button
                                    key={`${entry.id_log}-${i}`}
                                    onClick={() => {
                                      if (!tieneDetalle) return;
                                      setTooltipActivo(estaActivo ? null : { logId: entry.id_log, idx: i });
                                    }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 4,
                                      background: estaActivo ? 'var(--sys-primary)' : 'var(--sys-bg)',
                                      border: `1px solid ${estaActivo ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                                      borderRadius: 6, padding: '4px 10px',
                                      fontSize: 12, fontWeight: 600,
                                      color: estaActivo ? 'var(--sys-bg-white)' : 'var(--sys-text-muted)',
                                      cursor: tieneDetalle ? 'pointer' : 'default',
                                      transition: 'all 0.15s',
                                    }}
                                  >
                                    {cambio.etiqueta}
                                    {tieneDetalle && (
                                      <span style={{ fontSize: 10, opacity: 0.7 }}>{estaActivo ? ' ▲' : ' ▼'}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {tooltipActivo && grupo.some(e => e.id_log === tooltipActivo.logId) && (() => {
                              const entryActivo = grupo.find(e => e.id_log === tooltipActivo.logId);
                              if (!entryActivo) return null;
                              const cambio = buildCambios(entryActivo, clientesMap, usuariosMap)[tooltipActivo.idx];
                              if (!cambio || (cambio.antes === undefined && cambio.despues === undefined)) return null;
                              return (
                                <div style={{
                                  background: 'var(--sys-surface)',
                                  border: '1px solid var(--sys-border)',
                                  borderRadius: 8, padding: '12px 16px',
                                  borderLeft: '3px solid var(--sys-primary)',
                                }}>
                                  <div style={{
                                    fontSize: 11, fontWeight: 700, color: 'var(--sys-primary)',
                                    marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                                  }}>
                                    {cambio.etiqueta}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, color: 'var(--sys-danger)',
                                        background: 'var(--sys-danger-bg)', borderRadius: 3, padding: '2px 6px',
                                        flexShrink: 0, marginTop: 1,
                                      }}>ANTES</span>
                                      <span style={{
                                        fontSize: 13, color: 'var(--sys-text-dark)',
                                        textDecoration: 'line-through', opacity: 0.55,
                                        wordBreak: 'break-word', lineHeight: 1.4,
                                      }}>
                                        {cambio.antes || '—'}
                                      </span>
                                    </div>
                                    <div style={{ height: 1, background: 'var(--sys-border)' }} />
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, color: 'var(--sys-success)',
                                        background: 'var(--sys-success-bg)', borderRadius: 3, padding: '2px 6px',
                                        flexShrink: 0, marginTop: 1,
                                      }}>AHORA</span>
                                      <span style={{
                                        fontSize: 13, color: 'var(--sys-text-dark)', fontWeight: 500,
                                        wordBreak: 'break-word', lineHeight: 1.4,
                                      }}>
                                        {cambio.despues || '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Controles de Cargar más */}
                {historial.length > limiteHistorial && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button className="btn btn-ghost" onClick={() => setLimiteHistorial(prev => prev + ITEMS_POR_CARGA)}>
                      Cargar más movimientos ↓
                    </button>
                  </div>
                )}
              </>
            );
          })()}
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
      <WarningModal
        isOpen={confirmarBorrar}
        onClose={() => setConfirmarBorrar(false)}
        onConfirm={handleBorrarOrden}
        title="Eliminar Orden"
        message={
          <>
            ¿Estás seguro de que deseas eliminar la orden <b>#{orden.numero_orden}</b>?
            <span style={{ display: 'block', marginTop: 8 }}>
              Esta acción es irreversible y eliminará permanentemente la orden del sistema.
            </span>
          </>
        }
      />
      {orden && (
        <ImprimirOrdenModal
          isOpen={modalImprimir}
          onClose={() => setModalImprimir(false)}
          orden={orden}
          apoyos={apoyos}
          notas={notas}
        />
      )}

    </>
  );
} 