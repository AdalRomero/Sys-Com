import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function ConfirmarCorreo() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

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
        textAlign: 'center',
        boxShadow: 'var(--sys-shadow-soft)'
      }}>
        {loading ? (
          <>
            <Loader2 size={48} style={{ color: 'var(--sys-primary)', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ margin: '0 0 8px 0', fontSize: 24, color: 'var(--sys-text-dark)' }}>Verificando...</h2>
            <p style={{ color: 'var(--sys-text-muted)' }}>Por favor espera un momento mientras validamos tu enlace.</p>
          </>
        ) : (
          <>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              backgroundColor: 'var(--sys-success-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px'
            }}>
              <CheckCircle size={40} style={{ color: 'var(--sys-success)' }} />
            </div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 24, color: 'var(--sys-text-dark)' }}>¡Correo Confirmado!</h2>
            <p style={{ color: 'var(--sys-text-muted)', marginBottom: 32, fontSize: 14, lineHeight: 1.5 }}>
              Tu dirección de correo electrónico ha sido verificada exitosamente. Ya puedes acceder a la plataforma de Syscom con tus credenciales.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', textAlign: 'center', justifyContent: 'center' }} onClick={() => navigate('/')}>
              Ir a Iniciar Sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
