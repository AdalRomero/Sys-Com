import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormSelect from '../../components/FormSelect';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { createCliente, createEmpresa, getEmpresas } from '../../../src/service/clientes.service';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';

// =============================================================
// NOTA IMPORTANTE
// =============================================================
// El esquema nuevo ya no distingue 'frecuente' / 'ocasional'. Ahora
// el selector es TIPO DE REGISTRO: 'empresa' (tabla 'empresa') o
// 'cliente' (tabla 'clientes'). Un 'cliente' puede, opcionalmente,
// vincularse a una 'empresa' ya existente vía id_empresa.
// =============================================================

type TipoRegistro = 'empresa' | 'cliente';

interface Empresa {
  id_empresa: string;
  nombre: string;
}

export default function NuevoCliente() {
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>('empresa');

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargandoEmpresas, setCargandoEmpresas] = useState(false);

  // Campos para Empresa
  const [formDataEmpresa, setFormDataEmpresa] = useState({
    nombre: '',
    correo: '',
    lada: '',
    telefono: '',
    direccion: '',
  });

  // Campos para Cliente
  const [formDataCliente, setFormDataCliente] = useState({
    nombre: '',
    correo: '',
    lada: '',
    telefono: '',
    direccion: '',
    id_empresa: '', // opcional — vínculo a una empresa existente
  });

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: ''
  });

  // Carga el listado de empresas para poder vincular un cliente a una de ellas.
  useEffect(() => {
    if (tipoRegistro !== 'cliente') return;
    if (empresas.length > 0) return;

    setCargandoEmpresas(true);
    getEmpresas()
      .then((data: any[]) => setEmpresas(data || []))
      .finally(() => setCargandoEmpresas(false));
  }, [tipoRegistro, empresas.length]);

  const handleChangeEmpresa = (field: string) => (value: string) => {
    setFormDataEmpresa((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangeCliente = (field: string) => (value: string) => {
    setFormDataCliente((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    if (tipoRegistro === 'empresa') {
      if (
        !formDataEmpresa.nombre.trim() ||
        !formDataEmpresa.correo.trim() ||
        !formDataEmpresa.telefono.trim()
      ) {
        setModalState({ ...modalState, error: true, errorMessage: 'El nombre, correo y el número de telefono son obligatorios para la empresa.' });
        return;
      }
    } else {
      if (!formDataCliente.nombre.trim() || !formDataCliente.correo.trim()) {
        setModalState({ ...modalState, error: true, errorMessage: 'El nombre y el correo son obligatorios para el cliente.' });
        return;
      }
    }

    const rawPayload = tipoRegistro === 'empresa' ? formDataEmpresa : formDataCliente;

    const payloadLimpio = Object.fromEntries(
      Object.entries(rawPayload).filter(([_, value]) => value.trim() !== '')
    );

    setEnviando(true);

    const res =
      tipoRegistro === 'empresa'
        ? await createEmpresa(payloadLimpio)
        : await createCliente(payloadLimpio);

    setEnviando(false);

    if (res.success) {
      setModalState({
        ...modalState,
        success: true,
        successMessage: `${tipoRegistro === 'empresa' ? 'Empresa' : 'Cliente'} encolado exitosamente.`,
      });
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Ocurrió un error al crear el registro.' });
    }
  };

  const handleSuccessClose = () => {
    setModalState({ ...modalState, success: false });
    navigate('/clientes');
  };

  return (
    <>
      <Header title="Nuevo Cliente" />
      <div className="app-content">
        <div className="page-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1>Registro de Cliente</h1>
              <p>Complete los datos para registrar una empresa o un cliente en el sistema.</p>
            </div>
          </div>
          <div className="action-bar">
            <button className="btn btn-primary" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Regresar
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Tipo de Registro */}
          <div className="form-section form-section-service animate-fade-in-up">
            <h3 className="form-section-title">Tipo de Registro</h3>
            <div className="form-grid-2">
              <FormSelect
                label="Seleccione qué desea registrar"
                value={tipoRegistro}
                onChange={(v) => setTipoRegistro(v as TipoRegistro)}
                id="nc-tipo"
                options={[
                  { value: 'empresa', label: 'Empresa' },
                  { value: 'cliente', label: 'Cliente' },
                ]}
              />
            </div>
            <div className="card card-context context-info" style={{ padding: '10px 14px', marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-muted)' }}>
                {tipoRegistro === 'empresa'
                  ? 'Nota: El registro de empresas lleva un historial completo y se almacena por versiones según cada actualización.'
                  : 'Nota: El registro de clientes lleva un historial completo y se almacena por versiones según cada actualización.'}
              </p>
            </div>
          </div>

          {/* Formulario Dinámico */}
          <div className="form-section form-section-client animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <h3 className="form-section-title">
              {tipoRegistro === 'empresa' ? 'Datos de la Empresa' : 'Datos del Cliente'}
            </h3>

            {tipoRegistro === 'empresa' ? (
              <>
                <div className="form-grid-2">
                  <FormInput
                    label="Nombre de la Empresa"
                    placeholder="Ej. Syscom S.A. de C.V."
                    value={formDataEmpresa.nombre}
                    onChange={handleChangeEmpresa('nombre')}
                    required
                    id="nce-nombre"
                  />
                  <FormInput
                    label="Correo Electrónico"
                    placeholder="contacto@empresa.com"
                    value={formDataEmpresa.correo}
                    onChange={handleChangeEmpresa('correo')}
                    type="email"
                    required
                    id="nce-correo"
                  />
                </div>
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ width: 90 }}>
                      <FormInput
                        label="Lada"
                        placeholder="52"
                        value={formDataEmpresa.lada}
                        onChange={handleChangeEmpresa('lada')}
                        id="nce-lada"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <FormInput
                        label="Teléfono"
                        placeholder="55 1234 5678"
                        value={formDataEmpresa.telefono}
                        onChange={handleChangeEmpresa('telefono')}
                        required
                        id="nce-telefono"
                      />
                    </div>
                  </div>
                  <FormInput
                    label="Dirección"
                    placeholder="Av. Principal 123, Centro"
                    value={formDataEmpresa.direccion}
                    onChange={handleChangeEmpresa('direccion')}
                    id="nce-direccion"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-grid-2">
                  <FormInput
                    label="Nombre del Cliente"
                    placeholder="Ej. Juan Pérez"
                    value={formDataCliente.nombre}
                    onChange={handleChangeCliente('nombre')}
                    required
                    id="ncc-nombre"
                  />
                  <FormSelect
                    label="Vincular a Empresa (opcional)"
                    value={formDataCliente.id_empresa}
                    onChange={(v) => handleChangeCliente('id_empresa')(v)}
                    id="ncc-empresa"
                    options={[
                      { value: '', label: cargandoEmpresas ? 'Cargando empresas...' : 'Ninguna' },
                      ...empresas.map((emp) => ({ value: emp.id_empresa, label: emp.nombre })),
                    ]}
                  />

                </div>
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  <FormInput
                    label="Correo Electrónico"
                    placeholder="cliente@correo.com"
                    required
                    value={formDataCliente.correo}
                    onChange={handleChangeCliente('correo')}
                    type="email"
                    id="ncc-correo"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ width: 90 }}>
                      <FormInput
                        label="Lada"
                        placeholder="52"
                        value={formDataCliente.lada}
                        onChange={handleChangeCliente('lada')}
                        id="ncc-lada"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <FormInput
                        label="Teléfono"
                        placeholder="55 1234 5678"
                        value={formDataCliente.telefono}
                        onChange={handleChangeCliente('telefono')}
                        id="ncc-telefono"
                      />
                    </div>
                  </div>
                </div>
                <FormInput
                  label="Dirección"
                  placeholder="Av. Principal 123, Centro"
                  value={formDataCliente.direccion}
                  onChange={handleChangeCliente('direccion')}
                  id="ncc-direccion"
                />

              </>
            )}

          </div>

          {/* Botones */}
          <div className="action-bar" style={{ paddingTop: 8, paddingBottom: 24 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              <UserPlus size={16} />
              {enviando ? 'Creando...' : tipoRegistro === 'empresa' ? 'Crear Empresa' : 'Crear Cliente'}
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