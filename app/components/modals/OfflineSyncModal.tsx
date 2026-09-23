import { useState, useEffect } from 'react';
import { useConexion } from '../../../src/hooks/useConexion';
import { loginConProteccion } from '../../../src/service/auth.service';
import { syncQueue } from '../../../src/lib/syncService';
import { Eye, EyeOff } from 'lucide-react';

export default function OfflineSyncModal() {
  const isOnline = useConexion();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    // Si regresa la conexión, checamos si la sesión actual es una "sesión offline mockeada"
    if (isOnline) {
      const offlineSessionStr = localStorage.getItem('offline_session');
      if (offlineSessionStr) {
        try {
          const offlineData = JSON.parse(offlineSessionStr);
          setEmail(offlineData.email);
          setIsOpen(true);
        } catch (e) { }
      }
      return;
    }

    // Se volvió a caer la conexión mientras el modal estaba abierto: pedir
    // la contraseña ahora solo daría un error de red confuso ("contraseña
    // incorrecta" cuando en realidad es que no hay señal). Se cierra solo;
    // se va a volver a mostrar la próxima vez que la conexión regrese.
    setIsOpen(false);
    setStatus('idle');
    setErrorMsg('');
  }, [isOnline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setStatus('loading');
    setErrorMsg('');

    // IMPORTANTE: limpiar offline_session ANTES de loginConProteccion para evitar
    // la condición de carrera: setSession() dentro de loginConProteccion dispara
    // onAuthStateChange inmediatamente, y si offline_session aún existe en ese
    // momento, AuthContext lo ignora y el perfil correcto no se carga.
    localStorage.removeItem('offline_session');

    const res = await loginConProteccion(email, password);
    if (res.success) {
      setIsOpen(false);
      setStatus('idle');

      // Lanzar sincronización de inmediato ahora que hay token
      await syncQueue();
      
      // Recargar la página para obtener todos los datos frescos en línea y rehidratar el contexto
      window.location.reload();
    } else {
      setStatus('error');
      setErrorMsg(res.error || 'Contraseña incorrecta.');
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
      <div style={{ background: 'var(--sys-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--sys-text-dark)', fontSize: '18px' }}>Conexión Recuperada</h3>
        <p style={{ margin: '0 0 20px 0', color: 'var(--sys-text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
          Iniciaste sesión sin conexión. Para poder sincronizar los cambios locales con el servidor, necesitamos verificar tu contraseña nuevamente.
        </p>

        <style>
          {`
            .modal-password-input::-ms-reveal,
            .modal-password-input::-ms-clear {
              display: none;
            }
          `}
        </style>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={status === 'loading'}
              className="modal-password-input"
              style={{ width: '100%', padding: '10px 12px', paddingRight: '40px', borderRadius: '6px', border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text-base)', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sys-text-muted)' }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {status === 'error' && (
            <p style={{ color: 'var(--sys-danger, #e5484d)', fontSize: '13px', margin: 0 }}>{errorMsg}</p>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>

            <button
              type="submit"
              disabled={status === 'loading' || !password}
              style={{ flex: 2, padding: '10px', background: 'var(--sys-primary)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: status === 'loading' ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center' }}
            >
              {status === 'loading' ? 'Verificando...' : 'Sincronizar Datos'}
            </button>
          </div>
        </form>

        <p style={{ margin: '16px 0 0 0', color: 'var(--sys-text-muted)', fontSize: '12px', textAlign: 'center' }}>
          Puedes seguir trabajando con tus datos locales sin problema. Nada se pierde -- solo hace falta tu contraseña para subir los cambios pendientes al servidor.
        </p>
      </div>
    </div>
  );
}