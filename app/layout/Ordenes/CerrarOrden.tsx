import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSecureParams } from '../../../src/hooks/useSecureParams';
import { ArrowLeft, Save, Printer, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../../src/context/AuthContext';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormTextarea from '../../components/FormTextarea';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { getOrdenById, cerrarOrden } from '../../../src/service/ordenes.service';
import type { Orden } from '../../../src/types';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import ImprimirOrdenModal from '../../components/ImprimirOrdenModal';

// ─── helpers ────────────────────────────────────────────────────────────────

const nombrePerfil = (
  perfil?: { nombres: string; apellido_paterno: string; apellido_materno?: string } | null
) => perfil
    ? `${perfil.nombres} ${perfil.apellido_paterno} ${perfil.apellido_materno ?? ''}`.trim()
    : null;


const nombreCliente = (cliente?: Orden['cliente']) => {
  if (!cliente) return null;
  if (cliente.empresa?.nombre && cliente.nombre) {
    return `${cliente.empresa.nombre} (${cliente.nombre})`;
  }
  return cliente.nombre ?? cliente.empresa?.nombre ?? null;
};

export default function CerrarOrden() {
  const { id } = useSecureParams<{ id: string }>();
  const navigate = useNavigate();
  const { perfil } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [formData, setFormData] = useState({
    fechaEntrega: new Date().toISOString().split('T')[0],
    observacionesFinales: '',
    confirmacion: false,
  });

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: ''
  });
  const [modalImprimir, setModalImprimir] = useState(false);

  const [fechaActual, setFechaActual] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setFechaActual(new Date().toLocaleString('es-MX', {
        timeZone: 'America/Phoenix',
        dateStyle: 'short',
        timeStyle: 'medium'
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchDetalle = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const ordenRes = await getOrdenById(id);
        setOrden(ordenRes);
      } catch (err) {
        console.error("Error al cargar orden", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetalle();
  }, [id]);

  const handleChange = (field: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    if (!formData.confirmacion) {
      setModalState({ ...modalState, error: true, errorMessage: 'Debe confirmar la entrega del equipo.' });
      return;
    }
    if (!formData.observacionesFinales) {
      setModalState({ ...modalState, error: true, errorMessage: 'Debe agregar observaciones finales.' });
      return;
    }

    if (!id) return;
    setEnviando(true);

    const res = await cerrarOrden(id, formData.observacionesFinales);
    if (res.success) {
      // El correo al cliente ya NO se dispara desde aquí: un trigger en
      // cierre_orden (AFTER INSERT) llama a la Edge Function
      // notificar-cliente-orden en cuanto peticion_queue crea el cierre
      // real (con las observaciones finales ya guardadas), sin depender
      // de que esta pestaña siga abierta.
      setModalState({ ...modalState, success: true, successMessage: 'Orden cerrada exitosamente en la base de datos.' });
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error al cerrar la orden.' });
    }
  };

  const handleSuccessClose = () => {
    setModalState({ ...modalState, success: false });
    navigate('/ordenes-pendientes');
  };

  if (isLoading) {
    return (
      <>
        <Header title="Cerrar Orden" />
        <div className="app-content" style={{ textAlign: 'center', paddingTop: 80 }}>
          <p style={{ color: 'var(--sys-text-muted)' }}>Cargando información de la orden...</p>
        </div>
      </>
    );
  }

  if (!orden) {
    return (
      <>
        <Header title="Cerrar Orden" />
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
      <Header title="Cerrar Orden" />
      <div className="app-content">
        {/* Encabezado */}
        <div className="page-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1>
                Cerrar Orden — {orden.numero_orden}
              </h1>
              <p>
                Finalizar la orden y registrar la entrega del equipo.
              </p>
            </div>
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
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {nombreCliente(orden.cliente) ?? '—'}
              </div>            </div>
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
            <div>
              <div style={{ fontSize: 12, color: 'var(--sys-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Técnico</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{nombrePerfil(orden.responsable_perfil)}</div>
            </div>
          </div>
        </div>

        {/* Formulario de cierre */}
        <form onSubmit={handleSubmit}>
          <div className="form-section form-section-success">
            <h3 className="form-section-title">Datos de Cierre</h3>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <FormInput
                label="Fecha de finalización"
                value={`${fechaActual} (Arizona)`}
                readOnly
                id="fecha-entrega"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <FormTextarea
                label="Observaciones finales de cierre"
                placeholder="Notas adicionales sobre la solución o entregables..."
                value={formData.observacionesFinales}
                onChange={handleChange('observacionesFinales')}
                rows={4}
                id="observaciones-finales"
              />
            </div>
          </div>

          {/* Confirmación */}
          <div className={`card card-context`} style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16,
                backgroundColor: formData.confirmacion ? 'var(--sys-success-light)' : 'var(--sys-bg)',
                border: '1px solid',
                borderColor: formData.confirmacion ? 'var(--sys-success)' : 'var(--sys-border)',
                borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <input
                type="checkbox"
                checked={formData.confirmacion}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmacion: e.target.checked }))}
                style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--sys-success)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sys-text-dark)', marginBottom: 4 }}>
                  Confirmación de entrega
                </div>
                <div style={{ fontSize: 13, color: 'var(--sys-text-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Confirmo que el equipo ha sido entregado al cliente en las condiciones descritas y que la orden puede ser cerrada.</span>
                  {formData.confirmacion && (
                    <CheckCircle2 size={18} style={{ color: 'var(--sys-success)', flexShrink: 0 }} />
                  )}
                </div>
              </div>
            </label>
          </div>

          {/* Botones */}
          <div className="action-bar" style={{ paddingBottom: 24 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => setModalImprimir(true)}
            >
              <Printer size={16} />
              Imprimir comprobante de entrega
            </button>
            {(!orden.responsable || perfil?.rol !== 'minimo' || perfil?.id_perfil_info === orden.responsable) && (
              <button
                type="submit"
                className="btn btn-success"
                disabled={!formData.confirmacion}
                style={{ opacity: formData.confirmacion ? 1 : 0.5 }}
              >
                <Save size={16} />
                Cerrar orden
              </button>
            )}
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

      {orden && (
        <ImprimirOrdenModal
          isOpen={modalImprimir}
          onClose={() => setModalImprimir(false)}
          orden={orden}
          descripcionCliente={formData.observacionesFinales || undefined}
        />
      )}
    </>
  );
}