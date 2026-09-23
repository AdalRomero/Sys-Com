import { useState } from 'react';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/utils/supabase';
import { Save } from 'lucide-react';

// AJUSTA LAS RUTAS DE IMPORT DE ARRIBA a donde realmente vivan estos
// archivos en tu proyecto — las copié siguiendo el mismo patrón que usa
// NuevaOrden.tsx, pero no tengo tu árbol de carpetas real para este archivo
// nuevo.

export default function ConfiguracionCorreo() {
  const { perfil } = useAuth();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: '',
  });

  // Solo administradores pueden ver este apartado. El backend (Edge
  // Function) también valida esto de forma independiente — este check aquí
  // es solo para no mostrar el formulario, no es la barrera de seguridad
  // real.
  if (perfil && perfil.rol !== 'administrador') {
    return (
      <>
        <Header title="Configuración" />
        <div className="app-content">
          <div className="card card-context context-warning" style={{ padding: 24 }}>
            <p style={{ margin: 0 }}>No tienes permisos para ver esta sección.</p>
          </div>
        </div>
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <>
      <Header title="Configuración de correo" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Correo de notificaciones</h1>
            <p>Correo desde el cual el sistema envía avisos a los clientes sobre sus órdenes de servicio.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section animate-fade-in-up" style={{ maxWidth: 480 }}>
            <FormInput
              label="Nuevo correo"
              placeholder="notificaciones@tuempresa.com"
              value={correo}
              onChange={setCorreo}
              type="email"
              required
              id="smtp-correo"
            />
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

            <div className="card card-context" style={{ padding: '12px 16px', marginTop: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-muted)' }}>
                Este cambio afecta a todo el sistema de inmediato: los próximos correos de notificación
                a clientes se enviarán desde esta cuenta. Si usas Gmail/Outlook, probablemente necesites
                una "contraseña de aplicación" (app password), no tu contraseña normal de acceso.
              </p>
            </div>
          </div>

          <div className="action-bar" style={{ paddingTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              <Save size={16} />
              {enviando ? 'Actualizando...' : 'Actualizar correo'}
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
        onClose={() => setModalState({ ...modalState, success: false })}
        title="¡Listo!"
        message={modalState.successMessage}
      />
    </>
  );
}
