import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormSelect from '../../components/FormSelect';
import FormTextarea from '../../components/FormTextarea';
import { Save } from 'lucide-react';
import { getTecnicos } from '../../../src/service/usuarios.service';
import { getClientes, getEmpresas, crearEmpresaInline } from '../../../src/service/clientes.service';
import { createOrdenConCliente, getUltimoNumeroOrden } from '../../../src/service/ordenes.service';
import type { Cliente } from '../../../src/types';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { useAuth } from '../../../src/context/AuthContext';
import { useRealtimeOrdenes } from '../../../src/hooks/realtime/useRealtimeOrdenes';


interface Empresa {
  id_empresa: string;
  nombre: string;
  correo?: string; // necesario para poder notificar por correo a la empresa
}

type NuevaEmpresaData = {
  nombre: string;
  correo: string;
  lada: string;
  telefono: string;
  direccion: string;
};

const EMPRESA_VACIA: NuevaEmpresaData = { nombre: '', correo: '', lada: '', telefono: '', direccion: '' };

export default function NuevaOrden() {
  const { perfil } = useAuth();

  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [formData, setFormData] = useState({
    usuario: perfil ? `${perfil.nombres} ${perfil.apellido_paterno} ${perfil.apellido_materno}`.trim() : '',
    prioridad: 'media',
    actividad: 'oficina',

    // Selector de cliente (única lista, sin distinción de tipo)
    id_cliente: 'nuevo',
    nombre: '',
    correo: '',
    lada: '',
    telefono: '',
    direccion: '',
    id_empresa: '', // opcional — vincular el cliente nuevo a una empresa existente o 'nueva' para crear una

    // Orden de Servicio
    responsable: '',
    equipo: '',
    problema: '',
    observaciones: '',
  });

  // Datos de la empresa a crear cuando id_empresa === 'nueva'
  const [nuevaEmpresa, setNuevaEmpresa] = useState<NuevaEmpresaData>(EMPRESA_VACIA);

  const [_isLoading, setIsLoading] = useState(true);
  const [listaTecnicos, setListaTecnicos] = useState<{ id: string; nombre: string }[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: ''
  });

  const [fechaActual, setFechaActual] = useState('');
  const [folioEstimado, setFolioEstimado] = useState<number | null>(null);

  // Trae el último numero_orden y calcula el estimado (+1). Se llama al
  // montar y cada vez que llega un cambio realtime sobre orden_servicio,
  // por si alguien más registra/procesa una orden mientras este formulario
  // sigue abierto.
  const cargarFolioEstimado = async () => {
    const ultimo = await getUltimoNumeroOrden();
    setFolioEstimado(ultimo + 1);
  };

  useEffect(() => {
    cargarFolioEstimado();
  }, []);

  useRealtimeOrdenes(cargarFolioEstimado);

  // Tras encolar la orden, el folio real lo asigna el trigger de Supabase
  // de forma asíncrona (no es instantáneo). Esta función escucha una sola
  // vez el evento 'data-changed' (el mismo que usa RealtimeProvider) y
  // resuelve en cuanto llega el INSERT real de ESTA orden (por id), o
  // después de 'timeoutMs' si tarda demasiado (ej. dispatcher ocupado).
  const esperarFolioReal = (idOrden: string, timeoutMs = 15000): Promise<number | null> => {
    return new Promise((resolve) => {
      let resuelto = false;
      const terminar = (valor: number | null) => {
        if (resuelto) return;
        resuelto = true;
        window.removeEventListener('data-changed', listener);
        clearTimeout(timer);
        resolve(valor);
      };
      const listener = (e: Event) => {
        const { tabla, event, new: fila } = (e as CustomEvent).detail || {};
        if (
          tabla === 'orden_servicio' &&
          event === 'INSERT' &&
          fila?.id_orden_servicio === idOrden
        ) {
          terminar(typeof fila.numero_orden === 'number' ? fila.numero_orden : null);
        }
      };
      window.addEventListener('data-changed', listener);
      const timer = setTimeout(() => terminar(null), timeoutMs);
    });
  };

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
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [tecnicosRes, clientesRes, empresasRes] = await Promise.all([
          getTecnicos(),
          getClientes(),
          getEmpresas(),
        ]);
        setListaTecnicos(tecnicosRes);
        setClientes(clientesRes as Cliente[]);
        setEmpresas(empresasRes as Empresa[]);
      } catch (err) {
        console.error("Error al cargar dependencias de nueva orden", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleChange = (field: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangeNuevaEmpresa = (field: keyof NuevaEmpresaData) => (value: string) => {
    setNuevaEmpresa((prev) => ({ ...prev, [field]: value }));
  };

  const handleEmpresaSelectChange = (value: string) => {
    handleChange('id_empresa')(value);
    if (value !== 'nueva') setNuevaEmpresa(EMPRESA_VACIA);
  };

  const handleClienteChange = (val: string) => {
    if (val === 'nuevo') {
      setFormData(prev => ({
        ...prev,
        id_cliente: 'nuevo',
        nombre: '',
        contacto: '',
        correo: '',
        lada: '',
        telefono: '',
        direccion: '',
        id_empresa: '',
      }));
      setNuevaEmpresa(EMPRESA_VACIA);
      return;
    }
    const cliente = clientes.find((c) => c.id_cliente === val);
    if (cliente) {
      setFormData((prev) => ({
        ...prev,
        id_cliente: val,
        nombre: cliente.nombre || '',
        correo: cliente.correo || '',
        lada: cliente.lada || '',
        telefono: cliente.telefono || '',
        direccion: cliente.direccion || '',
        id_empresa: cliente.id_empresa || '',
      }));
      setNuevaEmpresa(EMPRESA_VACIA);
    }
  };

  const nombreRepetido =
    formData.id_cliente === 'nuevo' &&
    formData.nombre.length > 3 &&
    clientes.some((c) => (c.nombre || '').toLowerCase() === formData.nombre.toLowerCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    const esNuevo = formData.id_cliente === 'nuevo';

    if (esNuevo) {
      if (!formData.nombre.trim() || !formData.correo.trim()) {
        setModalState({ ...modalState, error: true, errorMessage: 'Nombre y correo son obligatorios para el cliente.' });
        return;
      }
      if (formData.id_empresa === 'nueva' && (!nuevaEmpresa.nombre.trim() || !nuevaEmpresa.correo.trim() || !nuevaEmpresa.telefono.trim())) {
        setModalState({ ...modalState, error: true, errorMessage: 'Nombre, correo y teléfono de la nueva empresa son obligatorios.' });
        return;
      }
    }

    if (!formData.problema.trim()) {
      setModalState({ ...modalState, error: true, errorMessage: 'La descripción del problema es obligatoria.' });
      return;
    }
    if (!formData.responsable) {
      setModalState({ ...modalState, error: true, errorMessage: 'Debe asignar un técnico responsable.' });
      return;
    }
    if (!formData.equipo) {
      setModalState({ ...modalState, error: true, errorMessage: 'Debe especificar el equipo a revisar.' });
      return;
    }

    setEnviando(true);

    const idClienteExistente = esNuevo ? null : formData.id_cliente;

    // Si el cliente es nuevo y eligió crear una empresa nueva, la creamos
    // primero para poder usar su id al armar el payload del cliente.
    let idEmpresaFinal: string | null = null;
    if (esNuevo) {
      if (formData.id_empresa === 'nueva') {
        const resEmpresa = await crearEmpresaInline({
          nombre: nuevaEmpresa.nombre,
          ...(nuevaEmpresa.correo.trim() && { correo: nuevaEmpresa.correo }),
          ...(nuevaEmpresa.lada.trim() && { lada: nuevaEmpresa.lada }),
          ...(nuevaEmpresa.telefono.trim() && { telefono: nuevaEmpresa.telefono }),
          ...(nuevaEmpresa.direccion.trim() && { direccion: nuevaEmpresa.direccion }),
        });

        if (!resEmpresa.success || !resEmpresa.idEmpresa) {
          setModalState({ ...modalState, error: true, errorMessage: resEmpresa.error || 'No se pudo crear la nueva empresa.' });
          setEnviando(false);
          return;
        }
        idEmpresaFinal = resEmpresa.idEmpresa;
      } else if (formData.id_empresa.trim()) {
        idEmpresaFinal = formData.id_empresa;
      }
    }

    const clienteNuevo = esNuevo
      ? {
        nombre: formData.nombre,
        ...(formData.correo.trim() && { correo: formData.correo }),
        ...(formData.lada.trim() && { lada: formData.lada }),
        ...(formData.telefono.trim() && { telefono: formData.telefono }),
        ...(formData.direccion.trim() && { direccion: formData.direccion }),
        ...(idEmpresaFinal && { id_empresa: idEmpresaFinal }),
      }
      : null;

    const ordenBase = {
      prioridad: formData.prioridad,
      actividad: formData.actividad,
      responsable: formData.responsable,
      equipo: formData.equipo,
      problema: formData.problema,
      observaciones: formData.observaciones,
    };

    const res = await createOrdenConCliente(ordenBase, idClienteExistente, clienteNuevo);

    if (res.success) {
      if (res.numeroLocal) {
        // Se guardó sin internet: el folio mostrado es temporal, el
        // definitivo se asigna al sincronizar.
        setModalState({
          ...modalState,
          success: true,
          successMessage: `Orden guardada. Folio temporal: #${res.numeroLocal} (se asignará el folio definitivo en cuanto haya conexión).`,
        });
        setEnviando(false);
      } else {
        // Se encoló en línea: esperamos la confirmación real por Realtime
        // antes de anunciar el folio (el trigger lo asigna de forma async).
        const folioReal = await esperarFolioReal(res.idOrden!);
        if (folioReal !== null) {
          setModalState({
            ...modalState,
            success: true,
            successMessage: `Orden guardada exitosamente con el folio #${folioReal}.`,
          });
        } else {
          setModalState({
            ...modalState,
            success: true,
            successMessage: 'Orden guardada exitosamente. Está tardando un poco en asignarse el folio; podrás verlo en la lista de órdenes pendientes.',
          });
        }
        setEnviando(false);
      }
      // El correo al cliente ya NO se dispara desde aquí: un trigger en
      // orden_servicio (AFTER INSERT) llama a la Edge Function
      // notificar-cliente-orden en cuanto peticion_queue procesa el INSERT
      // real, sin depender de que esta pestaña siga abierta.
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error.' });
      setEnviando(false);
    }
  };

  const handleSuccessClose = () => {
    setModalState({ ...modalState, success: false });
    navigate('/ordenes-pendientes');
  };

  return (
    <>
      <Header title="Nueva orden" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Registro de Servicio</h1>
            <p>Complete los detalles para generar una nueva orden de servicio técnico.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Datos Generales */}
          <div className="form-section form-section-service animate-fade-in-up">
            <h3 className="form-section-title">Datos Generales</h3>
            <div className="form-grid-4">
              <FormInput
                label="Usuario que levanta"
                value={formData.usuario}
                readOnly
                id="usuario-levanta"
              />
              <FormInput
                label="Fecha de registro"
                value={`${fechaActual} (Arizona)`}
                readOnly
                id="fecha-registro"
              />
              <FormSelect
                label="Prioridad"
                value={formData.prioridad}
                onChange={handleChange('prioridad')}
                id="prioridad"
                options={[
                  { value: 'baja', label: 'Baja' },
                  { value: 'media', label: 'Media' },
                  { value: 'alto', label: 'Alto' },
                  { value: 'urgente', label: 'Urgente' },
                ]}
              />
              <FormSelect
                label="Tipo de actividad"
                value={formData.actividad}
                onChange={handleChange('actividad')}
                id="tipo-actividad"
                options={[
                  { value: 'remoto', label: 'Remoto' },
                  { value: 'oficina', label: 'Oficina' },
                  { value: 'domicilio', label: 'Domicilio' },
                ]}
              />
            </div>
          </div>

          {/* Información del Cliente */}
          <div className="form-section form-section-client animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <h3 className="form-section-title">Información del Cliente</h3>

            <div style={{ marginBottom: 16 }}>
              <div className="form-grid-3" style={{ marginBottom: 16 }}>
                <FormSelect
                  label="Seleccionar Cliente"
                  value={formData.id_cliente}
                  onChange={handleClienteChange}
                  id="c-select"
                  options={[
                    { value: 'nuevo', label: '--- Crear Nuevo ---' },
                    ...clientes.map(c => ({ value: c.id_cliente, label: c.nombre || '(Sin nombre)' }))
                  ]}
                />
                <FormInput
                  label="Nombre del Cliente"
                  placeholder="Ej. Juan Pérez"
                  required
                  value={formData.nombre}
                  onChange={handleChange('nombre')}
                  readOnly={formData.id_cliente !== 'nuevo'}
                  id="c-nombre"
                />
                <FormInput
                  label="Correo electrónico"
                  placeholder="Ej. contacto@empresa.com"
                  required
                  value={formData.correo}
                  onChange={handleChange('correo')}
                  readOnly={formData.id_cliente !== 'nuevo'}
                  type="email"
                  id="c-correo"
                />
                <FormInput
                  label="Dirección"
                  placeholder="Ej. Av. Principal 123"
                  value={formData.direccion}
                  onChange={handleChange('direccion')}
                  readOnly={formData.id_cliente !== 'nuevo'}
                  id="c-direccion"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ width: 80 }}>
                    <FormInput
                      label="Lada"
                      placeholder="52"
                      value={formData.lada}
                      onChange={handleChange('lada')}
                      readOnly={formData.id_cliente !== 'nuevo'}
                      id="c-lada"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <FormInput
                      label="Teléfono"
                      placeholder="55 1234 5678"
                      value={formData.telefono}
                      onChange={handleChange('telefono')}
                      readOnly={formData.id_cliente !== 'nuevo'}
                      type="tel"
                      id="c-telefono"
                    />
                  </div>
                </div>
                {formData.id_cliente === 'nuevo' && (
                  <FormSelect
                    label="Vincular a Empresa (opcional)"
                    value={formData.id_empresa}
                    onChange={handleEmpresaSelectChange}
                    id="c-empresa"
                    options={[
                      { value: '', label: 'Ninguna' },
                      { value: 'nueva', label: '--- Crear Nueva Empresa ---' },
                      ...empresas.map((emp) => ({ value: emp.id_empresa, label: emp.nombre })),
                    ]}
                  />
                )}
              </div>

              {formData.id_cliente === 'nuevo' && formData.id_empresa === 'nueva' && (
                <div className="card card-context" style={{ padding: '16px', marginBottom: 16 }}>
                  {/* Fila 1: nombre (más espacio, es el dato más largo) + correo */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1.6 }}>
                      <FormInput
                        label="Nombre de la Empresa"
                        placeholder="Ej. Grupo Industrial SA de CV"
                        value={nuevaEmpresa.nombre}
                        onChange={handleChangeNuevaEmpresa('nombre')}
                        required
                        id="empresa-nombre"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <FormInput
                        label="Correo"
                        placeholder="Ej. contacto@empresa.com"
                        required
                        value={nuevaEmpresa.correo}
                        onChange={handleChangeNuevaEmpresa('correo')}
                        type="email"
                        id="empresa-correo"
                      />
                    </div>
                  </div>

                  {/* Fila 2: dirección (más espacio) + lada (angosto, tamaño fijo) + teléfono */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1.6 }}>
                      <FormInput
                        label="Dirección"
                        placeholder="Ej. Av. Principal 123"
                        value={nuevaEmpresa.direccion}
                        onChange={handleChangeNuevaEmpresa('direccion')}
                        id="empresa-direccion"
                      />
                    </div>
                    <div style={{ width: 80, flexShrink: 0 }}>
                      <FormInput
                        label="Lada"
                        placeholder="52"
                        value={nuevaEmpresa.lada}
                        onChange={handleChangeNuevaEmpresa('lada')}
                        id="empresa-lada"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <FormInput
                        label="Teléfono"
                        placeholder="638 123 5678"
                        required
                        value={nuevaEmpresa.telefono}
                        onChange={handleChangeNuevaEmpresa('telefono')}
                        type="tel"
                        id="empresa-telefono"
                      />
                    </div>
                  </div>

                  <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--sys-text-muted)' }}>
                    Esta empresa se creará y quedará vinculada al cliente al guardar la orden.
                  </p>
                </div>
              )}

              {nombreRepetido && (
                <div className="card card-context context-warning" style={{ padding: '10px 14px', marginTop: '-4px' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-dark)' }}>
                    <strong>Atención:</strong> Ya existe un cliente con este nombre. Si es la misma persona o empresa, por favor selecciónala en la lista de arriba para mantener su historial. De lo contrario, puedes continuar para crear un registro distinto.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Detalles del Servicio y Problema */}
          <div className="form-section form-section-equipment animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="form-section-title">Detalles del Servicio</h3>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <FormSelect
                label="Técnico responsable asignado"
                required
                value={formData.responsable}
                onChange={handleChange('responsable')}
                placeholder="Seleccione un técnico..."
                id="responsable-asignado"
                options={listaTecnicos.map((t) => ({ value: t.id, label: t.nombre }))}
              />
              <FormInput
                label="Equipo"
                placeholder="Ej. Laptop Dell Latitude, Servidor HP..."
                required
                value={formData.equipo}
                onChange={handleChange('equipo')}
                id="equipo"
              />
            </div>

            <FormTextarea
              label="Descripción del Problema"
              required
              placeholder="Describa el fallo reportado por el cliente de manera detallada..."
              value={formData.problema}
              onChange={handleChange('problema')}
              rows={4}
              id="descripcion-problema"
            />
          </div>

          {/* Observaciones */}
          <div className="form-section form-section-notes animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <FormTextarea
              label="Observaciones Internas"
              placeholder="Notas adicionales o comentarios internos..."
              value={formData.observaciones}
              onChange={handleChange('observaciones')}
              rows={3}
              id="observaciones"
            />
          </div>

          {/* Aviso de folio */}
          <div className="card card-context" style={{ padding: '12px 16px', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--sys-text-dark)' }}>
              Esta orden se registrará con el folio estimado{' '}
              <strong>#{folioEstimado ?? '...'}</strong>. El número puede variar ligeramente
              según el orden en que se procesen las órdenes en cola.
            </p>
          </div>

          {/* Botones */}
          <div className="action-bar" style={{ paddingTop: 8, paddingBottom: 24 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Cancelar
            </button>

            <button type="submit" className="btn btn-primary" disabled={enviando}>
              <Save size={16} />
              {enviando ? 'Guardando...' : 'Guardar orden'}
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