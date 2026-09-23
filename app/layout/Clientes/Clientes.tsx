import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Search, ChevronLeft, ChevronRight, Pencil, Trash2, RotateCcw } from 'lucide-react';
import Header from '../../components/Header';
import {
  getClientesPaginados,
  deleteCliente,
  toggleActivoCliente,
  getEmpresasPaginadas,
  deleteEmpresa,
  getClientesPorEmpresa,
} from '../../../src/service/clientes.service';
import { getOrdenesPorCliente } from '../../../src/service/ordenes.service';
import type { Cliente, Empresa, Orden } from '../../../src/types';
import StatusBadge from '../../components/StatusBadge';
import { formatFecha } from '../../../src/utils/dateFormatter';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';
import WarningModal from '../../components/modals/WarningModal';

import { useRealtimeClientes } from '../../../src/hooks/realtime/useRealtimeClientes';
import { useRealtimeEmpresas } from '../../../src/hooks/realtime/useRealtimeEmpresas';

type Tab = 'clientes' | 'empresas';

type ClienteDeEmpresa = {
  id_cliente: string;
  nombre: string | null;
  correo: string | null;
  lada: string | null;
  telefono: string | null;
  activo?: boolean | null;
};

export default function Clientes() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('clientes');
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [total, setTotal] = useState(0);

  const [listaClientes, setListaClientes] = useState<Cliente[]>([]);
  const [listaEmpresas, setListaEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const totalPaginas = Math.ceil(total / 5) || 1;

  // Selección para el panel lateral: puede ser un cliente o una empresa
  const [seleccion, setSeleccion] = useState<
    { tipo: 'cliente'; item: Cliente } | { tipo: 'empresa'; item: Empresa } | null
  >(null);

  const [ordenesDelCliente, setOrdenesDelCliente] = useState<Orden[]>([]);
  const [clientesDeEmpresa, setClientesDeEmpresa] = useState<ClienteDeEmpresa[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);

  const [itemAEliminar, setItemAEliminar] = useState<
    { tipo: 'cliente'; item: Cliente } | { tipo: 'empresa'; item: Empresa } | null
  >(null);
  const [modalState, setModalState] = useState({
    success: false, error: false, errorMessage: '', successMessage: ''
  });

  // ==========================================
  // Fetch de la lista según pestaña activa
  // ==========================================
  const fetchLista = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    try {
      if (tab === 'clientes') {
        const { data, count } = await getClientesPaginados(paginaActual, 5, busqueda);
        setListaClientes(data as Cliente[]);
        setTotal(count);
      } else {
        const { data, count } = await getEmpresasPaginadas(paginaActual, 5, busqueda);
        setListaEmpresas(data as Empresa[]);
        setTotal(count);
      }
    } catch (err) {
      console.error('Error cargando lista:', err);
      setModalState((prev) => ({ ...prev, error: true, errorMessage: 'No se pudo cargar la lista.' }));
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  }, [tab, paginaActual, busqueda]);

  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

  // Al cambiar de pestaña o de búsqueda, reinicia la paginación
  useEffect(() => {
    setPaginaActual(1);
  }, [tab, busqueda]);
  // ==========================================
  // Realtime: escucha cambios en clientes y empresas
  // ==========================================
  useRealtimeClientes();
  useRealtimeEmpresas();

  useEffect(() => {
    const onRefetchClientes = () => {
      if (tab === 'clientes') fetchLista(true);
    };
    const onRefetchEmpresas = () => {
      if (tab === 'empresas') fetchLista(true);
    };

    window.addEventListener('refetch-clientes', onRefetchClientes);
    window.addEventListener('refetch-empresas', onRefetchEmpresas);
    return () => {
      window.removeEventListener('refetch-clientes', onRefetchClientes);
      window.removeEventListener('refetch-empresas', onRefetchEmpresas);
    };
  }, [tab, fetchLista]);

  // ==========================================
  // Carga del panel lateral solo cuando se abre
  // ==========================================
  useEffect(() => {
    if (!seleccion) {
      setOrdenesDelCliente([]);
      setClientesDeEmpresa([]);
      return;
    }

    setLoadingPanel(true);
    if (seleccion.tipo === 'cliente') {
      getOrdenesPorCliente(seleccion.item.id_cliente)
        .then(setOrdenesDelCliente)
        .catch(console.error)
        .finally(() => setLoadingPanel(false));
    } else {
      getClientesPorEmpresa(seleccion.item.id_empresa)
        .then((data) => setClientesDeEmpresa(data as ClienteDeEmpresa[]))
        .catch(console.error)
        .finally(() => setLoadingPanel(false));
    }
  }, [seleccion]);


  // ==========================================
  // Eliminar (cliente o empresa)
  // ==========================================
  const handleConfirmDelete = async () => {
    if (!itemAEliminar) return;

    const res = itemAEliminar.tipo === 'cliente'
      ? await deleteCliente(itemAEliminar.item.id_cliente)
      : await deleteEmpresa(itemAEliminar.item.id_empresa);

    if (res.success) {
      setModalState({ ...modalState, success: true, successMessage: 'Eliminado exitosamente.' });
      fetchLista();
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Error al eliminar.' });
    }
    setItemAEliminar(null);
  };

  const handleEditar = (item: Cliente | Empresa) => {
    if (tab === 'clientes') {
      navigate(`/clientes/${(item as Cliente).id_cliente}`);
    } else {
      navigate(`/empresas/${(item as Empresa).id_empresa}`);
    }
  };

  const handleToggleActivo = async (cliente: Cliente) => {
    const nuevoEstado = cliente.activo === false; // inactivo (false) → reactivar (true); activo → desactivar (false)
    const res = await toggleActivoCliente(cliente.id_cliente, nuevoEstado);
    if (res.success) {
      setModalState({
        ...modalState,
        success: true,
        successMessage: nuevoEstado ? 'Cliente desactivado. Sigue apareciendo en el historial.' : 'Cliente reactivado exitosamente.'
      });
      fetchLista();
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Error al cambiar el estado del cliente.' });
    }
  };

  return (
    <>
      <Header title="Gestión de Clientes" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Gestión de Clientes</h1>
            <p>Administra clientes y empresas para autollenar órdenes y rastrear su historial.</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/nuevo-cliente')}>
            <Plus size={18} /> Agregar Cliente o Empresa
          </button>
        </div>

        <div className="card card-context context-info" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div className="form-group">
              <label className="form-label">Búsqueda</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                <input
                  className="form-input"
                  placeholder={tab === 'clientes' ? "Nombre, correo, teléfono..." : "Empresa, correo, teléfono..."}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn ${tab === 'clientes' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('clientes')}>Clientes</button>
                <button className={`btn ${tab === 'empresas' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('empresas')}>Empresas</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card table-card animate-fade-in-up bg-white rounded-xl shadow-sm border border-gray-100" style={{ minHeight: 400 }}>
          <div className="w-full overflow-x-auto">
            {isLoading ? (
              <div className="p-10 text-center text-gray-500 font-medium">Cargando...</div>
            ) : tab === 'clientes' ? (
              <table className="data-table w-full text-center min-w-max">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Nombre</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Correo</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Teléfono</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Empresa</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listaClientes.map((cliente) => (
                    <tr key={cliente.id_cliente} className={`hover:bg-gray-50/50 transition-colors group ${cliente.activo === false ? 'opacity-50 grayscale bg-gray-50' : ''}`}>
                      <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-normal break-words max-w-[130px] mx-auto text-center leading-tight">
                        {cliente.nombre ?? '—'}
                        {cliente.activo === false && (
                          <div className="text-[10px] uppercase font-bold text-gray-400 mt-1">Inactivo</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">{cliente.correo ?? '—'}</td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">
                        {cliente.lada ? `${cliente.lada} ` : ''}{cliente.telefono ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">
                        {cliente.empresa?.nombre ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <button className="btn-icon hover:bg-blue-50" title="Ver historial" onClick={() => setSeleccion({ tipo: 'cliente', item: cliente })}>
                            <Eye size={18} style={{ color: 'var(--sys-info)' }} />
                          </button>
                          <button className="btn-icon hover:bg-gray-100" title="Editar" onClick={() => handleEditar(cliente)}>
                            <Pencil size={18} style={{ color: 'var(--sys-text-secondary)' }} />
                          </button>
                          {cliente.activo === false ? (
                            <button
                              className="btn-icon hover:bg-green-50"
                              title="Reactivar cliente"
                              onClick={() => handleToggleActivo(cliente)}
                            >
                              <RotateCcw size={18} style={{ color: 'var(--sys-success)' }} />
                            </button>
                          ) : (
                            <button
                              className="btn-icon hover:bg-red-50"
                              title="Desactivar cliente"
                              onClick={() => setItemAEliminar({ tipo: 'cliente', item: cliente })}
                            >
                              <Trash2 size={18} style={{ color: 'var(--sys-danger)' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="data-table w-full text-center min-w-max">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Empresa</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Correo</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Lada</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Teléfono</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listaEmpresas.map((empresa) => (
                    <tr key={empresa.id_empresa} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-normal break-words max-w-[130px] mx-auto text-center leading-tight">
                        {empresa.nombre}
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">{empresa.correo ?? '—'}</td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">{empresa.lada ?? '—'}</td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">{empresa.telefono ?? '—'}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <button className="btn-icon hover:bg-blue-50" onClick={() => setSeleccion({ tipo: 'empresa', item: empresa })}>
                            <Eye size={18} style={{ color: 'var(--sys-info)' }} />
                          </button>
                          <button className="btn-icon hover:bg-gray-100" onClick={() => handleEditar(empresa)}>
                            <Pencil size={18} style={{ color: 'var(--sys-text-secondary)' }} />
                          </button>
                          <button className="btn-icon hover:bg-red-50" onClick={() => setItemAEliminar({ tipo: 'empresa', item: empresa })}>
                            <Trash2 size={18} style={{ color: 'var(--sys-danger)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <span>Mostrando página {paginaActual} de {totalPaginas}</span>
            <div className="pagination">
              <button className="pagination-btn" disabled={paginaActual === 1} onClick={() => setPaginaActual(paginaActual - 1)}>
                <ChevronLeft size={16} />
              </button>
              {(() => {
                let start = Math.max(1, paginaActual - 1);
                if (start + 2 > totalPaginas) start = Math.max(1, totalPaginas - 2);
                const end = Math.min(start + 2, totalPaginas);
                return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                  <button key={p} className={`pagination-btn ${paginaActual === p ? 'active' : ''}`} onClick={() => setPaginaActual(p)}>
                    {p}
                  </button>
                ));
              })()}
              <button className="pagination-btn" disabled={paginaActual === totalPaginas} onClick={() => setPaginaActual(paginaActual + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Panel lateral: historial de órdenes (cliente) o clientes asociados (empresa) */}
      {seleccion && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSeleccion(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'var(--sys-backdrop)',
              backdropFilter: 'blur(4px)',
              zIndex: 40,
              animation: 'fadeIn 0.2s ease',
            }}
          />
          {/* Drawer */}
          <div style={{
            position: 'fixed',
            top: 0, right: 0,
            height: '100%',
            width: 420,
            maxWidth: '95vw',
            background: 'linear-gradient(180deg, var(--sys-surface-raised), var(--sys-surface))',
            boxShadow: 'var(--sys-shadow-lg), -4px 0 20px rgba(0,0,0,0.12)',
            border: '1px solid var(--sys-border)',
            borderRight: 'none',
            borderRadius: 'var(--sys-radius-xl) 0 0 var(--sys-radius-xl)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeInUp 0.25s ease forwards',
          }}>
            {/* Header — estilo app-header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 20px',
              height: 'var(--sys-header-height)',
              background: 'linear-gradient(90deg, rgba(47, 125, 246, 0.14), rgba(5, 150, 105, 0.08)), var(--sys-header-bg)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--sys-header-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                  {seleccion.tipo === 'cliente' ? 'Historial del Cliente' : 'Detalle de Empresa'}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sys-header-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {seleccion.tipo === 'cliente' ? (seleccion.item.nombre ?? '—') : seleccion.item.nombre}
                </div>
              </div>
              <button
                onClick={() => setSeleccion(null)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--sys-header-text-muted)', padding: 8, borderRadius: 'var(--sys-radius)',
                  display: 'flex', alignItems: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--sys-header-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sys-header-text-muted)'; }}
              >
              </button>
            </div>

            {/* Info bar */}
            <div style={{
              padding: '14px 20px',
              background: 'var(--sys-surface-tint)',
              borderBottom: '1px solid var(--sys-border-light)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: seleccion.tipo === 'cliente' ? 'var(--sys-info)' : 'var(--sys-success)',
                boxShadow: `0 0 0 3px ${seleccion.tipo === 'cliente' ? 'var(--sys-info-bg)' : 'var(--sys-success-bg)'}`,
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sys-text-muted)' }}>
                {seleccion.tipo === 'cliente'
                  ? `${ordenesDelCliente.length} orden${ordenesDelCliente.length !== 1 ? 'es' : ''} registrada${ordenesDelCliente.length !== 1 ? 's' : ''}`
                  : `${clientesDeEmpresa.length} cliente${clientesDeEmpresa.length !== 1 ? 's' : ''} asociado${clientesDeEmpresa.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Contenido */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingPanel ? (
                <div style={{ textAlign: 'center', color: 'var(--sys-text-muted)', padding: 40, fontSize: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', margin: '0 auto 12px',
                    border: '3px solid var(--sys-border-light)',
                    borderTopColor: 'var(--sys-primary)',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Cargando...
                </div>
              ) : seleccion.tipo === 'cliente' ? (
                ordenesDelCliente.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '48px 16px',
                    color: 'var(--sys-text-muted)', fontSize: 14,
                  }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                      background: 'var(--sys-bg)',
                      border: '2px dashed var(--sys-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Eye size={28} style={{ color: 'var(--sys-text-light)' }} />
                    </div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--sys-text-dark)', marginBottom: 4 }}>Sin órdenes registradas</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-light)' }}>Este cliente no tiene órdenes en el sistema.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {ordenesDelCliente.map((orden, index) => (
                      <div
                        key={orden.id_orden_servicio}
                        onClick={() => navigate(`/orden/${orden.id_orden_servicio}`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '14px 10px',
                          borderBottom: index < ordenesDelCliente.length - 1 ? '1px solid var(--sys-border-light)' : 'none',
                          cursor: 'pointer', borderRadius: 'var(--sys-radius)', transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--sys-bg)'; e.currentTarget.style.boxShadow = 'var(--sys-shadow-sm)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        {/* Avatar con número de orden */}
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                          background: orden.estado === 'finalizado'
                            ? 'linear-gradient(135deg, #10b981, #047857)'
                            : orden.estado === 'en proceso'
                              ? 'linear-gradient(135deg, var(--sys-primary-bright), var(--sys-primary-deep))'
                              : 'linear-gradient(135deg, var(--sys-warning), #b45309)',
                          color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                          boxShadow: '0 8px 16px -10px rgba(0,0,0,0.4)',
                        }}>
                          #{orden.numero_orden}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text-dark)' }}>
                              {orden.equipo ?? orden.problema ?? '—'}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--sys-text-light)', flexShrink: 0, marginLeft: 8 }}>
                              {formatFecha(orden.created)}
                            </span>
                          </div>
                          <StatusBadge estado={orden.estado} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                clientesDeEmpresa.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '48px 16px',
                    color: 'var(--sys-text-muted)', fontSize: 14,
                  }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                      background: 'var(--sys-bg)',
                      border: '2px dashed var(--sys-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Eye size={28} style={{ color: 'var(--sys-text-light)' }} />
                    </div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--sys-text-dark)', marginBottom: 4 }}>Sin clientes asociados</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-light)' }}>Esta empresa no tiene clientes vinculados.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {clientesDeEmpresa.map((cliente, index) => (
                      <div
                        key={cliente.id_cliente}
                        onClick={() => navigate(`/clientes/${cliente.id_cliente}`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '14px 10px',
                          borderBottom: index < clientesDeEmpresa.length - 1 ? '1px solid var(--sys-border-light)' : 'none',
                          cursor: 'pointer', borderRadius: 'var(--sys-radius)', transition: 'all 0.15s ease',
                          opacity: cliente.activo === false ? 0.5 : 1,
                          filter: cliente.activo === false ? 'grayscale(100%)' : 'none',
                          background: cliente.activo === false ? 'var(--sys-bg)' : 'transparent'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--sys-bg)'; e.currentTarget.style.boxShadow = 'var(--sys-shadow-sm)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        {/* Avatar iniciales */}
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, var(--sys-primary-bright), var(--sys-primary-deep))',
                          color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700,
                          boxShadow: '0 8px 16px -10px rgba(26, 86, 219, 0.7)',
                        }}>
                          {(cliente.nombre?.[0] ?? '?').toUpperCase()}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {cliente.nombre ?? '—'}
                            {cliente.activo === false && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--sys-text-muted)', marginLeft: 8, textTransform: 'uppercase' }}>Inactivo</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {cliente.correo ?? '—'} · {cliente.lada ? `${cliente.lada} ` : ''}{cliente.telefono ?? '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--sys-border)',
              background: 'var(--sys-surface-tint)',
              display: 'flex', gap: 10,
            }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  if (seleccion.tipo === 'cliente') {
                    handleEditar(seleccion.item);
                  } else {
                    handleEditar(seleccion.item);
                  }
                }}
              >
                <Pencil size={15} /> Editar {seleccion.tipo === 'cliente' ? 'Cliente' : 'Empresa'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'center', minWidth: 90 }}
                onClick={() => setSeleccion(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </>
      )}

      <WarningModal
        isOpen={!!itemAEliminar}
        onClose={() => setItemAEliminar(null)}
        onConfirm={handleConfirmDelete}
        title={itemAEliminar?.tipo === 'cliente' ? 'Desactivar Cliente' : 'Eliminar Empresa'}
        message={
          itemAEliminar?.tipo === 'cliente'
            ? 'Si el cliente tiene órdenes asociadas se desactivará (podrás reactivarlo después). Si no tiene órdenes, se eliminará definitivamente.'
            : '¿Confirmar eliminación de la empresa?'
        }
      />
      <ErrorModal isOpen={modalState.error} onClose={() => setModalState({ ...modalState, error: false })} title="Error" message={modalState.errorMessage} />
      <SuccessModal isOpen={modalState.success} onClose={() => setModalState({ ...modalState, success: false })} title="Éxito" message={modalState.successMessage} />
    </>
  );
}