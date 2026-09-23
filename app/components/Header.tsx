import { useState, useRef, useEffect } from 'react';
import { User, Settings, UserCog, MailQuestionMark, Wifi, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import { useConexion } from '../../src/hooks/useConexion';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import NotificationsCard from './NotificationsCard';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { user, perfil } = useAuth();

  const [isConnOpen, setIsConnOpen] = useState(false);
  const connRef = useRef<HTMLDivElement>(null);
  const isOnline = useConexion();
  const { pendingCount } = useSyncQueue();

  const nombreCompleto = perfil
    ? `${perfil.nombres} ${perfil.apellido_paterno} ${perfil.apellido_materno}`
    : (user?.user_metadata?.full_name ?? 'Mi Cuenta');
  const correo = user?.email ?? '';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (connRef.current && !connRef.current.contains(event.target as Node)) {
        setIsConnOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="app-header ">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--sys-header-text)', margin: 0, whiteSpace: 'nowrap' }}>
          {title}
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div ref={connRef} style={{ position: 'relative' }}>
          <button
            className="btn-icon"
            aria-label={isOnline ? 'Conectado a internet' : 'Sin conexión a internet'}
            title={isOnline ? 'Conectado' : 'Sin conexión'}
            onClick={() => setIsConnOpen(!isConnOpen)}
            style={{
              background: isConnOpen ? 'var(--sys-white-a10)' : 'transparent',
              color: isOnline ? 'var(--sys-header-text-muted)' : 'var(--sys-danger, #e5484d)',
              position: 'relative',
            }}
          >
            {isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
            {!isOnline && (
              <span style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--sys-danger, #e5484d)',
                border: '1.5px solid var(--sys-surface)',
              }} />
            )}
          </button>

          {isConnOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              width: 220,
              background: 'var(--sys-surface)',
              borderRadius: 'var(--sys-radius-lg)',
              boxShadow: 'var(--sys-shadow-lg)',
              border: '1px solid var(--sys-border)',
              overflow: 'hidden',
              zIndex: 50,
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isOnline ? <Wifi size={18} color="var(--sys-text-base)" /> : <WifiOff size={18} color="var(--sys-danger, #e5484d)" />}
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--sys-text-dark)' }}>
                  {isOnline ? 'Conectado' : 'Sin conexión a internet'}
                </p>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sys-text-muted)' }}>
                {isOnline
                  ? 'Los cambios se guardan directo en línea.'
                  : 'Estás en modo sin conexión. La información mostrada puede cambiar cuando regrese el internet. Los cambios se guardan en este dispositivo y se subirán solos al recuperar internet.'}
              </p>
              {pendingCount > 0 && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sys-text-base)' }}>
                  {pendingCount} cambio{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'} por sincronizar
                </p>
              )}
            </div>
          )}
        </div>

        <NotificationsCard />

        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            className="btn-icon"
            aria-label="Perfil"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            style={{
              background: isProfileOpen ? 'var(--sys-white-a10)' : 'transparent',
              color: isProfileOpen ? 'var(--sys-header-text)' : 'var(--sys-header-text-muted)'
            }}
          >
            <User size={20} />
          </button>

          {isProfileOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              width: 240,
              background: 'var(--sys-surface)',
              borderRadius: 'var(--sys-radius-lg)',
              boxShadow: 'var(--sys-shadow-lg)',
              border: '1px solid var(--sys-border)',
              overflow: 'hidden',
              zIndex: 50,
            }}>
              {/* Información de usuario */}
              <div style={{ padding: '16px', borderBottom: '1px solid var(--sys-border-light)', background: 'var(--sys-surface-tint)' }}>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--sys-text-dark)', fontSize: 14 }}>
                  {nombreCompleto}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--sys-text-muted)', fontSize: 12 }}>
                  {correo}
                </p>
              </div>

              {/* Acciones */}
              <div style={{ padding: '8px 0' }}>

                <Link
                  to="/configuracion/perfil"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', color: 'var(--sys-text-base)', textDecoration: 'none', fontSize: 14, transition: 'background 0.2s' }}
                  onClick={() => setIsProfileOpen(false)}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--sys-bg)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <UserCog size={16} />
                  <span>Mi Perfil</span>
                </Link>
                <Link
                  to="/configuracion"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', color: 'var(--sys-text-base)', textDecoration: 'none', fontSize: 14, transition: 'background 0.2s' }}
                  onClick={() => setIsProfileOpen(false)}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--sys-bg)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Settings size={16} />
                  <span>Configuraciones</span>
                </Link>
                <Link
                  to="/contactos"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', color: 'var(--sys-text-base)', textDecoration: 'none', fontSize: 14, transition: 'background 0.2s' }}
                  onClick={() => setIsProfileOpen(false)}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--sys-bg)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <MailQuestionMark size={16} />
                  <span>Contáctanos</span>
                </Link>

              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}