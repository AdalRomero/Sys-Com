import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  History,
  Users,
  BarChart3,
  UserCog,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import syscomLogo from '../../assets/syscom-logo.svg';
import { useAuth } from '../../src/context/AuthContext';
import type { RolUsuario } from '../../src/types';
import InformationCard from './InformationCard';

// Matriz de visibilidad por rol. 'Ayuda' vive fuera de navGroups (en el
// footer) y se muestra siempre a todos los roles, sin filtro.
const navGroups: {
  label: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard; roles: RolUsuario[] }[];
}[] = [
    {
      label: 'Principal',
      items: [
        { to: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['administrador', 'limitado', 'minimo'] },
        { to: '/nueva-orden', label: 'Nueva orden', icon: PlusCircle, roles: ['administrador', 'limitado'] },
        { to: '/ordenes-pendientes', label: 'Órdenes pendientes', icon: ClipboardList, roles: ['administrador', 'limitado', 'minimo'] },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { to: '/historial', label: 'Historial de órdenes', icon: History, roles: ['administrador', 'limitado', 'minimo'] },
        { to: '/clientes', label: 'Clientes', icon: Users, roles: ['administrador', 'limitado'] },
        { to: '/usuarios', label: 'Personal', icon: UserCog, roles: ['administrador'] },
        { to: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['administrador'] },
      ],
    },
  ];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const location = useLocation();
  const { signOut, perfil } = useAuth();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + '/');

  const handleLinkClick = () => {
    if (window.innerWidth < 768) onToggle();
  };

  // Mientras el perfil todavía no carga, no mostramos nada restringido
  // (evita el "flash" del menú completo antes de saber el rol real).
  const rolActual = perfil?.rol;
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => rolActual && item.roles.includes(rolActual)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Overlay móvil */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onToggle}
      />

      {/* Sidebar */}
      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand — Logo */}
        <div className="sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sidebar-logo-wrapper">
              <img
                src={syscomLogo}
                alt="Sys-Com — Servicios y Sistemas en Computacion"
                className="sidebar-logo"
              />
            </div>
            <button
              className="mobile-menu-btn"
              onClick={onToggle}
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navegación */}
        <nav className="sidebar-nav">
          {/* Grupos */}
          {visibleGroups.map((group) => (
            <div key={group.label} className="sidebar-group">
              <span className="sidebar-group-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`sidebar-link ${isActive(item.to) ? 'active' : ''}`}
                  onClick={handleLinkClick}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Ayuda: visible para todos los roles, sin filtro */}
        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={() => setIsHelpOpen(!isHelpOpen)}>
            <HelpCircle size={20} />
            <span>Ayuda</span>
          </button>
          <InformationCard isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
          <button
            className="sidebar-link danger"
            onClick={() => signOut()}
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <LogOut size={20} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Botón hamburguesa para móviles */}
      <button
        className="mobile-menu-btn"
        onClick={onToggle}
        style={{
          position: 'fixed',
          top: 18,
          left: 16,
          zIndex: 50,
          display: isOpen ? 'none' : undefined,
        }}
        aria-label="Abrir menú"
      >
        <Menu size={24} />
      </button>
    </>
  );
}