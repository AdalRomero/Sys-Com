import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Mail, Phone, Trash2, User } from 'lucide-react';
import type { Usuario } from '../../src/types';

interface UserCardProps {
  usuario: Usuario;
  onDelete: (usuario: Usuario) => void;
  onAddCredentials: (usuario: Usuario) => void;
  onClick?: (usuario: Usuario) => void;
  isOnline: boolean;
}

const rolColors: Record<string, string> = {
  'administrador': 'var(--sys-primary)',
  'limitado': 'var(--sys-purple)',
  'minimo': 'var(--sys-cyan)',
};

const rolLabels: Record<string, string> = {
  'administrador': 'Administrador',
  'limitado': 'Limitado',
  'minimo': 'Mínimo',
};

export default function UserCard({ usuario, onDelete, onAddCredentials, onClick, isOnline }: UserCardProps) {
  const initials = `${usuario.nombres?.[0] || ''}${usuario.apellido_paterno?.[0] || ''}`.toUpperCase();
  const bgColor = rolColors[usuario.rol] || 'var(--sys-primary)';
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    }
    if (menuAbierto) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuAbierto]);

  return (
    <div className="card card-context context-info"
      onClick={() => onClick && onClick(usuario)}
      style={{ position: 'relative', padding: 24 }}>
      {/* Menú contextual */}
      <div ref={menuRef}
        style={{ position: 'absolute', top: 12, right: 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn-icon"
          aria-label="Opciones"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAbierto((v) => !v);
          }}
        >
          <MoreVertical size={18} />
        </button>

        {menuAbierto && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 200,
            backgroundColor: 'var(--sys-card-bg)',
            border: '1px solid var(--sys-border)',
            borderRadius: 8,
            boxShadow: 'var(--sys-shadow)',
            minWidth: 140,
            overflow: 'hidden',
          }}>
            {!usuario.auth_usuario && (
              <>
                <button
                  disabled={!isOnline}
                  title={!isOnline ? 'Requiere conexión a internet' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isOnline) {
                      onAddCredentials(usuario);
                      setMenuAbierto(false);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 14px',
                    background: 'none', border: 'none', cursor: !isOnline ? 'not-allowed' : 'pointer',
                    fontSize: 13, color: !isOnline ? 'var(--sys-text-muted)' : 'var(--sys-primary)', textAlign: 'left',
                    transition: 'background 0.15s',
                    opacity: !isOnline ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => { if (isOnline) e.currentTarget.style.background = 'var(--sys-bg)'; }}
                  onMouseLeave={(e) => { if (isOnline) e.currentTarget.style.background = 'none'; }}
                >
                  <User size={20} style={{ color: !isOnline ? 'var(--sys-text-muted)' : 'var(--sys-primary)' }} />
                  Agregar credenciales
                </button>
                <div style={{ height: 1, background: 'var(--sys-border)' }} />
              </>
            )}
            <button
              disabled={!isOnline}
              title={!isOnline ? 'Requiere conexión a internet' : ''}
              onClick={(e) => {
                e.stopPropagation();
                if (isOnline) {
                  onDelete(usuario);
                  setMenuAbierto(false);
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                background: 'none', border: 'none', cursor: !isOnline ? 'not-allowed' : 'pointer',
                fontSize: 13, color: !isOnline ? 'var(--sys-text-muted)' : 'var(--sys-danger)', textAlign: 'left',
                transition: 'background 0.15s',
                opacity: !isOnline ? 0.6 : 1
              }}
              onMouseEnter={(e) => { if (isOnline) e.currentTarget.style.background = 'var(--sys-bg)'; }}
              onMouseLeave={(e) => { if (isOnline) e.currentTarget.style.background = 'none'; }}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          </div>
        )}
      </div>

      {/* Avatar e info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div
          className="avatar-initials lg"
          style={{ background: bgColor }}
        >
          {initials}
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
            {usuario.nombres} {usuario.apellido_paterno} {usuario.apellido_materno}
          </h3>
          {/* Username */}
          <span style={{ fontSize: 12, color: 'var(--sys-text-muted)', fontFamily: 'monospace' }}>
            {usuario.usuario}
          </span>
          <br />
          <span className="badge badge-rol" style={{
            background: `${bgColor}15`,
            color: bgColor,
            marginTop: 4,
            display: 'inline-block',
          }}>
            {rolLabels[usuario.rol] || usuario.rol}
          </span>
        </div>
      </div>

      {/* Contacto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sys-text-muted)' }}>
          <Mail size={14} />
          <span>{usuario.contacto?.correo_personal || 'Sin correo'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sys-text-muted)' }}>
          <Phone size={14} />
          <span>
            {usuario.contacto?.telefono
              ? usuario.contacto.lada
                ? `+${usuario.contacto.lada} ${usuario.contacto.telefono}`
                : usuario.contacto.telefono
              : 'Sin teléfono'}
          </span>        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sys-text-muted)' }}>
          <User size={14} />
          <span style={{ fontSize: 12 }}>{usuario.contacto?.direccion || 'Sin dirección'}</span>
        </div>
      </div>
    </div>
  );
}
