import { useState, useEffect, useCallback } from 'react';
import { Settings, Bell, Shield, Palette, Globe, Save, Mail, Building2, History } from 'lucide-react';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/utils/supabase';
import {
  getConfiguracionEmpresaCompleta,
  getHistorialConfiguracionEmpresa,
  actualizarConfiguracionEmpresa,
  type DatosEmpresaEditables,
} from '../../../src/service/configuracionEmpresa.service';
import type { ConfiguracionEmpresa } from '../../../src/types/mirror';

const EMPRESA_FORM_VACIO: DatosEmpresaEditables & { motivoCambio: string } = {
  nombre: '',
  slogan: '',
  responsable: '',
  email: '',
  direccion: '',
  codigoPostal: '',
  telefono: '',
  fax: '',
  rfc: '',
  motivoCambio: '',
};

export default function Configuracion() {
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'administrador';

  const [activeTab, setActiveTab] = useState('general');
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Estado para el formulario de correo SMTP (solo admins)
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);

  // ── Estado para el CRUD de configuración de la empresa (solo admins) ──────
  const [empresaForm, setEmpresaForm] = useState(EMPRESA_FORM_VACIO);
  const [empresaCargada, setEmpresaCargada] = useState(false);
  const [cargandoEmpresa, setCargandoEmpresa] = useState(false);
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [historial, setHistorial] = useState<ConfiguracionEmpresa[]>([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: '',
  });

  const handleSubmitCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    if (!correo.trim() || !contrasena) {
      setModalState({ ...modalState, error: true, errorMessage: 'Correo y contraseña son obligatorios.' });
      return;
    }
    if (contrasena !== confirmarContrasena) {
      setModalState({ ...modalState, error: true, errorMessage: 'Las contraseñas no coinciden.' });
      return;
    }

    setEnviando(true);

    const { data, error } = await supabase.functions.invoke('admin-actualizar-smtp', {
      body: { correo: correo.trim(), contrasena },
    });

    if (error) {
      setModalState({ ...modalState, error: true, errorMessage: error.message || 'No se pudo actualizar el correo.' });
      setEnviando(false);
      return;
    }

    if ((data as any)?.error) {
      setModalState({ ...modalState, error: true, errorMessage: (data as any).error });
      setEnviando(false);
      return;
    }

    setModalState({
      ...modalState,
      success: true,
      successMessage: `El correo de notificaciones se actualizó a ${correo.trim()}. Los próximos avisos a clientes saldrán desde esta cuenta.`,
    });
    setCorreo('');
    setContrasena('');
    setConfirmarContrasena('');
    setEnviando(false);
  };

  // ── Cargar la configuración vigente de la empresa al entrar al tab ────────
  const cargarConfiguracionEmpresa = useCallback(async () => {
    setCargandoEmpresa(true);
    try {
      const vigente = await getConfiguracionEmpresaCompleta();
      if (vigente) {
        setEmpresaForm({
          nombre: vigente.nombre ?? '',
          slogan: vigente.slogan ?? '',
          responsable: vigente.responsable_nombre ?? '',
          email: vigente.email ?? '',
          direccion: vigente.direccion ?? '',
          codigoPostal: vigente.codigo_postal ?? '',
          telefono: vigente.telefono ?? '',
          fax: vigente.fax ?? '',
          rfc: vigente.rfc ?? '',
          motivoCambio: '',
        });
      }
      setEmpresaCargada(true);
    } catch (err: any) {
      setModalState((prev) => ({
        ...prev,
        error: true,
        errorMessage: err?.message || 'No se pudo cargar la configuración de la empresa.',
      }));
    } finally {
      setCargandoEmpresa(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'empresa' && esAdmin && !empresaCargada) {
      void cargarConfiguracionEmpresa();
    }
  }, [activeTab, esAdmin, empresaCargada, cargarConfiguracionEmpresa]);

  const cargarHistorial = async () => {
    const filas = await getHistorialConfiguracionEmpresa(15);
    setHistorial(filas);
    setMostrarHistorial(true);
  };

  const handleSubmitEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoEmpresa || !perfil) return;

    if (!empresaForm.motivoCambio.trim()) {
      setModalState({ ...modalState, error: true, errorMessage: 'Indica el motivo del cambio antes de guardar.' });
      return;
    }

    setGuardandoEmpresa(true);
    try {
      await actualizarConfiguracionEmpresa(
        {
          nombre: empresaForm.nombre,
          slogan: empresaForm.slogan,
          responsable: empresaForm.responsable,
          email: empresaForm.email,
          direccion: empresaForm.direccion,
          codigoPostal: empresaForm.codigoPostal,
          telefono: empresaForm.telefono,
          fax: empresaForm.fax,
          rfc: empresaForm.rfc,
        },
        empresaForm.motivoCambio,
        perfil.id_perfil_info
      );

      setModalState({
        ...modalState,
        success: true,
        successMessage: 'La configuración de la empresa se actualizó correctamente. Los próximos documentos de orden usarán estos datos.',
      });
      setEmpresaForm((prev) => ({ ...prev, motivoCambio: '' }));
      // Refresca por si algún otro admin cambió algo mientras tanto
      setEmpresaCargada(false);
      if (mostrarHistorial) void cargarHistorial();
    } catch (err: any) {
      setModalState({
        ...modalState,
        error: true,
        errorMessage: err?.message || 'No se pudo actualizar la configuración de la empresa.',
      });
    } finally {
      setGuardandoEmpresa(false);
    }
  };

  const setCampoEmpresa = (campo: keyof typeof empresaForm) => (valor: string) => {
    setEmpresaForm((prev) => ({ ...prev, [campo]: valor }));
  };

  return (
    <>
      <Header title="Configuraciones" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Configuración del Sistema</h1>
            <p>Ajusta las preferencias generales, apariencia y notificaciones de tu cuenta.</p>
          </div>
          <div className="action-bar">
            <button className="btn btn-primary" onClick={() => alert('Configuración guardada')}>
              <Save size={18} /> Guardar Cambios
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar Tabs */}
          <div className="card md:col-span-1 p-4" style={{ alignSelf: 'start' }}>
            <nav className="flex flex-col gap-2">
              <button
                onClick={() => setActiveTab('general')}
                className={`flex items-center gap-3 w-full text-left p-3 rounded-lg font-medium transition-colors ${activeTab === 'general' ? 'bg-[var(--sys-primary-light)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-base)] hover:bg-[var(--sys-bg)]'}`}
              >
                <Settings size={18} /> General
              </button>
              <button
                onClick={() => setActiveTab('apariencia')}
                className={`flex items-center gap-3 w-full text-left p-3 rounded-lg font-medium transition-colors ${activeTab === 'apariencia' ? 'bg-[var(--sys-primary-light)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-base)] hover:bg-[var(--sys-bg)]'}`}
              >
                <Palette size={18} /> Apariencia
              </button>
              <button
                onClick={() => setActiveTab('notificaciones')}
                className={`flex items-center gap-3 w-full text-left p-3 rounded-lg font-medium transition-colors ${activeTab === 'notificaciones' ? 'bg-[var(--sys-primary-light)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-base)] hover:bg-[var(--sys-bg)]'}`}
              >
                <Bell size={18} /> Notificaciones
              </button>
              <button
                onClick={() => setActiveTab('seguridad')}
                className={`flex items-center gap-3 w-full text-left p-3 rounded-lg font-medium transition-colors ${activeTab === 'seguridad' ? 'bg-[var(--sys-primary-light)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-base)] hover:bg-[var(--sys-bg)]'}`}
              >
                <Shield size={18} /> Seguridad
              </button>
              {/* Solo administradores pueden ver/editar los datos de la empresa
                  que aparecen en los documentos de orden (membrete, RFC, etc.) */}
              {esAdmin && (
                <button
                  onClick={() => setActiveTab('empresa')}
                  className={`flex items-center gap-3 w-full text-left p-3 rounded-lg font-medium transition-colors ${activeTab === 'empresa' ? 'bg-[var(--sys-primary-light)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-base)] hover:bg-[var(--sys-bg)]'}`}
                >
                  <Building2 size={18} /> Empresa
                </button>
              )}
            </nav>
          </div>

          {/* Content Area */}
          <div className="md:col-span-3 space-y-6">
            {activeTab === 'general' && (
              <div className="card card-context context-info">
                <h3 className="text-lg font-bold text-[var(--sys-text-dark)] mb-4">Ajustes Generales</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[var(--sys-text-base)] mb-1">Idioma del Sistema</label>
                    <div className="relative">
                      <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-light)]" />
                      <select className="w-full border border-[var(--sys-border)] rounded-lg p-2.5 pl-10 bg-white text-[var(--sys-text-dark)] focus:outline-none focus:border-[var(--sys-primary)] transition-colors">
                        <option>Español (México)</option>
                        <option>Inglés (US)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--sys-text-base)] mb-1">Zona Horaria</label>
                    <select className="w-full border border-[var(--sys-border)] rounded-lg p-2.5 bg-white text-[var(--sys-text-dark)] focus:outline-none focus:border-[var(--sys-primary)] transition-colors">
                      <option>(GMT-06:00) Guadalajara, Ciudad de México, Monterrey</option>
                      <option>(GMT-07:00) Chihuahua, La Paz, Mazatlán</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'apariencia' && (
              <div className="card card-context context-info">
                <h3 className="text-lg font-bold text-[var(--sys-text-dark)] mb-4">Apariencia</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[var(--sys-text-dark)]">Modo Oscuro</p>
                      <p className="text-sm text-[var(--sys-text-muted)]">Activar el tema oscuro en toda la aplicación.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--sys-primary)]"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notificaciones' && (
              <>
                <div className="card card-context context-info">
                  <h3 className="text-lg font-bold text-[var(--sys-text-dark)] mb-4">Preferencias de Notificaciones</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[var(--sys-text-dark)]">Notificaciones Push</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">Recibir alertas en tiempo real sobre nuevas órdenes.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={notifications} onChange={() => setNotifications(!notifications)} />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--sys-primary)]"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[var(--sys-text-dark)]">Alertas por Correo</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">Resumen diario enviado a tu email.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--sys-primary)]"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Sección de correo de notificaciones — solo visible para administradores */}
                {esAdmin && (
                  <div className="card card-context context-info">
                    <div className="flex items-center gap-2 mb-1">
                      <Mail size={18} className="text-[var(--sys-primary)]" />
                      <h3 className="text-lg font-bold text-[var(--sys-text-dark)]">Correo de notificaciones</h3>
                    </div>
                    <p className="text-sm text-[var(--sys-text-muted)] mb-4">
                      Correo desde el cual el sistema envía avisos a los clientes sobre sus órdenes de servicio.
                    </p>

                    <form onSubmit={handleSubmitCorreo}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput
                          label="Nuevo correo"
                          placeholder="notificaciones@tuempresa.com"
                          value={correo}
                          onChange={setCorreo}
                          type="email"
                          required
                          id="smtp-correo"
                        />
                        <div />
                        <FormInput
                          label="Contraseña / clave de aplicación"
                          placeholder="••••••••"
                          value={contrasena}
                          onChange={setContrasena}
                          type="password"
                          required
                          id="smtp-contrasena"
                        />
                        <FormInput
                          label="Confirmar contraseña"
                          placeholder="••••••••"
                          value={confirmarContrasena}
                          onChange={setConfirmarContrasena}
                          type="password"
                          required
                          id="smtp-confirmar"
                        />
                      </div>

                      <div className="card card-context" style={{ padding: '12px 16px', marginTop: 16 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-muted)' }}>
                          Este cambio afecta a todo el sistema de inmediato: los próximos correos de notificación
                          a clientes se enviarán desde esta cuenta. Si usas Gmail/Outlook, probablemente necesites
                          una "contraseña de aplicación" (app password), no tu contraseña normal de acceso.
                        </p>
                      </div>

                      <div className="action-bar" style={{ paddingTop: 12 }}>
                        <button type="submit" className="btn btn-primary" disabled={enviando}>
                          <Save size={16} />
                          {enviando ? 'Actualizando...' : 'Actualizar correo'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </>
            )}

            {activeTab === 'seguridad' && (
              <div className="card card-context context-warning">
                <h3 className="text-lg font-bold text-[var(--sys-text-dark)] mb-4">Seguridad</h3>
                <p className="text-sm text-[var(--sys-text-muted)] mb-4">Gestiona la seguridad de tu cuenta y sesiones activas.</p>
                <button className="btn btn-outline-primary w-full md:w-auto">
                  Configurar Autenticación de 2 Factores
                </button>
              </div>
            )}

            {/* ── Tab: Empresa (solo administradores) ─────────────────────── */}
            {activeTab === 'empresa' && esAdmin && (
              <>
                <div className="card card-context context-info">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 size={18} className="text-[var(--sys-primary)]" />
                    <h3 className="text-lg font-bold text-[var(--sys-text-dark)]">Datos de la empresa</h3>
                  </div>
                  <p className="text-sm text-[var(--sys-text-muted)] mb-4">
                    Esta información aparece en el membrete de las órdenes de servicio (internas y para el
                    cliente). Cada cambio queda registrado con fecha, quién lo hizo y el motivo.
                  </p>

                  {cargandoEmpresa ? (
                    <p className="text-sm text-[var(--sys-text-muted)]">Cargando configuración actual…</p>
                  ) : (
                    <form onSubmit={handleSubmitEmpresa}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput
                          label="Nombre de la empresa"
                          placeholder="Sys-Com"
                          value={empresaForm.nombre}
                          onChange={setCampoEmpresa('nombre')}
                          type="text"
                          required
                          id="empresa-nombre"
                        />
                        <FormInput
                          label="Slogan"
                          placeholder="Servicios"
                          value={empresaForm.slogan ?? ''}
                          onChange={setCampoEmpresa('slogan')}
                          type="text"
                          id="empresa-slogan"
                        />
                        <FormInput
                          label="Responsable"
                          placeholder="Fulanito de tal"
                          value={empresaForm.responsable ?? ''}
                          onChange={setCampoEmpresa('responsable')}
                          type="text"
                          id="empresa-responsable"
                        />
                        <FormInput
                          label="Correo"
                          placeholder="contacto@tuempresa.com"
                          value={empresaForm.email ?? ''}
                          onChange={setCampoEmpresa('email')}
                          type="email"
                          id="empresa-email"
                        />
                        <FormInput
                          label="Dirección"
                          placeholder="Entre calle oriente y josefa"
                          value={empresaForm.direccion ?? ''}
                          onChange={setCampoEmpresa('direccion')}
                          type="text"
                          id="empresa-direccion"
                        />
                        <FormInput
                          label="Código postal"
                          placeholder="83550"
                          value={empresaForm.codigoPostal ?? ''}
                          onChange={setCampoEmpresa('codigoPostal')}
                          type="text"
                          id="empresa-cp"
                        />
                        <FormInput
                          label="Teléfono"
                          placeholder="6338561926"
                          value={empresaForm.telefono ?? ''}
                          onChange={setCampoEmpresa('telefono')}
                          type="text"
                          id="empresa-telefono"
                        />
                        <FormInput
                          label="Fax"
                          placeholder="6338562343"
                          value={empresaForm.fax ?? ''}
                          onChange={setCampoEmpresa('fax')}
                          type="text"
                          id="empresa-fax"
                        />
                        <FormInput
                          label="RFC"
                          placeholder="F0DM2753179L3"
                          value={empresaForm.rfc ?? ''}
                          onChange={setCampoEmpresa('rfc')}
                          type="text"
                          id="empresa-rfc"
                        />
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <label
                          htmlFor="empresa-motivo"
                          className="block text-sm font-semibold text-[var(--sys-text-base)] mb-1"
                        >
                          Motivo del cambio <span style={{ color: 'var(--sys-danger, #dc2626)' }}>*</span>
                        </label>
                        <textarea
                          id="empresa-motivo"
                          value={empresaForm.motivoCambio}
                          onChange={(e) => setCampoEmpresa('motivoCambio')(e.target.value)}
                          placeholder="Ej. Se actualizó el teléfono por cambio de línea."
                          required
                          rows={2}
                          className="w-full border border-[var(--sys-border)] rounded-lg p-2.5 bg-white text-[var(--sys-text-dark)] focus:outline-none focus:border-[var(--sys-primary)] transition-colors"
                          style={{ resize: 'vertical' }}
                        />
                      </div>

                      <div className="card card-context" style={{ padding: '12px 16px', marginTop: 16 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-muted)' }}>
                          Al guardar se crea una nueva versión vigente de la configuración; la anterior queda
                          conservada en el historial (no se borra ni se sobreescribe). Requiere conexión a internet.
                        </p>
                      </div>

                      <div className="action-bar" style={{ paddingTop: 12, justifyContent: 'space-between' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={cargarHistorial}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <History size={16} /> Ver historial
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={guardandoEmpresa}>
                          <Save size={16} />
                          {guardandoEmpresa ? 'Guardando...' : 'Guardar nueva versión'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* ── Historial (solo lectura) ──────────────────────────────── */}
                {mostrarHistorial && (
                  <div className="card card-context context-info">
                    <div className="flex items-center gap-2 mb-3">
                      <History size={18} className="text-[var(--sys-primary)]" />
                      <h3 className="text-lg font-bold text-[var(--sys-text-dark)]">Historial de cambios</h3>
                    </div>
                    {historial.length === 0 ? (
                      <p className="text-sm text-[var(--sys-text-muted)]">Sin historial disponible.</p>
                    ) : (
                      <div className="space-y-3">
                        {historial.map((fila) => (
                          <div
                            key={fila.id_configuracion}
                            className="card card-context"
                            style={{
                              padding: '10px 14px',
                              borderLeft: fila.es_actual ? '3px solid var(--sys-primary, #4f46e5)' : undefined,
                            }}
                          >
                            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                              <strong style={{ fontSize: 13 }}>
                                {fila.nombre}
                                {fila.es_actual && (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: 'var(--sys-primary, #4f46e5)',
                                      background: 'var(--sys-primary-light, #eef2ff)',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    VIGENTE
                                  </span>
                                )}
                              </strong>
                              <span style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>
                                {new Date(fila.created).toLocaleString('es-MX', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                            </div>
                            {fila.motivo_cambio && (
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sys-text-base)' }}>
                                {fila.motivo_cambio}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
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
        onClose={() => setModalState({ ...modalState, success: false })}
        title="¡Listo!"
        message={modalState.successMessage}
      />
    </>
  );
}