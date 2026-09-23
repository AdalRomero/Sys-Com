import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Key, AlertCircle, ArrowLeft } from 'lucide-react';
import { adminUpdateUserPassword } from '../../../src/service/auth.service';

import WarningModal from '../../components/modals/WarningModal';
import SuccessModal from '../../components/modals/SuccessModal';
import ErrorModal from '../../components/modals/ErrorModal';

export default function RestablecerPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  // Capturamos el ID del usuario que viene por el state del navigate
  const authUsuarioId = location.state?.authUsuarioId;

  // Estados del formulario
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Estados de control para los modales
  const [showWarning, setShowWarning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [apiErrorMsg, setApiErrorMsg] = useState('');

  // Protección: Si alguien entra a la ruta directamente sin un ID, lo regresamos
  useEffect(() => {
    if (!authUsuarioId) {
      navigate('/usuarios', { replace: true });
    }
  }, [authUsuarioId, navigate]);

  // 1. Validar datos locales antes de abrir el modal de confirmación
  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password !== confirmPassword) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setShowWarning(true);
  };

  // 2. Ejecutar el cambio de contraseña (Como Administrador)
  const handleActualReset = async () => {
    setShowWarning(false);
    setLoading(true);

    // Usamos la función de administrador que llama a la Edge Function
    const res = await adminUpdateUserPassword(authUsuarioId, password);

    if (!res.success) {
      setApiErrorMsg(res.error || 'Ocurrió un error al actualizar la contraseña.');
      setShowError(true);
    } else {
      setShowSuccess(true);
    }

    setLoading(false);
  };

  if (!authUsuarioId) return null; // Evita parpadeos mientras redirige

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--sys-bg)',
      padding: 20
    }}>
      <div className="card animate-fade-in-up" style={{
        maxWidth: 400,
        width: '100%',
        padding: 40,
        boxShadow: 'var(--sys-shadow-soft)',
        position: 'relative'
      }}>

        {/* Botón para regresar si el admin se arrepiente */}
        <button
          onClick={() => navigate(-1)}
          className="btn btn-ghost"
          style={{ position: 'absolute', top: 16, left: 16, padding: '8px' }}
        >
          <ArrowLeft size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 32, marginTop: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: 'var(--sys-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Lock size={32} style={{ color: 'var(--sys-primary)' }} />
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 24, color: 'var(--sys-text-dark)' }}>Forzar Contraseña</h2>
          <p style={{ color: 'var(--sys-text-muted)', fontSize: 14 }}>
            Asigna una nueva contraseña de acceso para este usuario.
          </p>
        </div>

        <form onSubmit={handlePreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {formError && (
            <div style={{ padding: 12, backgroundColor: 'var(--sys-danger-bg)', color: 'var(--sys-danger)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span style={{ lineHeight: 1.4 }}>{formError}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 6 }}>Nueva Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: 38 }}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 6 }}>Confirmar Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: 38 }}
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8, padding: '12px 0', textAlign: 'center', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
          </button>
        </form>
      </div>

      {/* Renderizado de Modales */}
      <WarningModal
        isOpen={showWarning}
        onClose={() => setShowWarning(false)}
        onConfirm={handleActualReset}
        title="¿Cambiar contraseña al usuario?"
        message="Esta acción reemplazará la contraseña actual del usuario inmediatamente."
      />

      <SuccessModal
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          navigate('/usuarios'); // Regresamos a la lista de usuarios al terminar
        }}
        title="¡Contraseña Cambiada!"
        message="La contraseña del usuario ha sido actualizada exitosamente."
      />

      <ErrorModal
        isOpen={showError}
        onClose={() => setShowError(false)}
        title="Error de Actualización"
        message={apiErrorMsg}
      />
    </div>
  );
}