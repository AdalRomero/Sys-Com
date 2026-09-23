import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/main.css';
import { useAuth } from '../../src/context/AuthContext';
import ConflictResolver from '../components/ConflictResolver';
import OfflineSyncModal from '../components/modals/OfflineSyncModal';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--sys-bg)' }}>
        <p style={{ color: 'var(--sys-text-muted)', fontSize: 16 }}>Cargando sistema...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      <main className="app-main">
        <Outlet />
      </main>
      <ConflictResolver />
      <OfflineSyncModal />
    </div>
  );
}
