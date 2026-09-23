import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Eye, Play, CheckCircle, Search, ChevronLeft, ChevronRight, LucideUsers2, Calendar } from 'lucide-react';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import PanelTecnicosApoyo from '../../components/Paneltecnicosapoyo';
import { formatFecha } from '../../../src/utils/dateFormatter';
import { getTecnicos } from '../../../src/service/usuarios.service';
import type { Orden } from '../../../src/types';
import { useOrdenes } from '../../../src/hooks/useOrdenes';
import { useRealtimeOrdenes } from '../../../src/hooks/realtime';
import { procesarOrden } from '../../../src/service/ordenes.service';
import { useAuth } from '../../../src/context/AuthContext';

interface Tecnico { id: string; nombre: string; }

const nombreCliente = (orden: any): string => {
  return orden.cliente?.nombre || '—';
};

export default function OrdenesPendientes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { perfil } = useAuth();

  // El rol 'minimo' (técnico de apoyo) solo puede ver y cerrar órdenes.
  // No puede crear nuevas ni cambiar el estado de pendiente a 'en proceso'.
  const puedeGestionarOrdenes = perfil?.rol !== 'minimo';

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(location.state?.filtroEstado || '');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState(location.state?.filtroPrioridad || '');
  const [paginaActual, setPaginaActual] = useState(1);
  const [listaTecnicos, setListaTecnicos] = useState<Tecnico[]>([]);
  const [listaOrdenes, setListaOrdenes] = useState<Orden[]>([]);
  const [total, setTotal] = useState(0);
  const [filtroFecha, setFiltroFecha] = useState('');

  // Estado del panel de apoyos
  const [panelApoyoOrden, setPanelApoyoOrden] = useState<Orden | null>(null);

  const filtros = {
    estado: filtroEstado || undefined,
    responsable: filtroTecnico || undefined,
    prioridad: filtroPrioridad || undefined,
    busqueda: busqueda || undefined,
    fecha: filtroFecha || undefined,
  };

  const { isLoading } = useOrdenes(setListaOrdenes, setTotal, paginaActual, filtros);
  const totalPaginas = Math.ceil(total / 5) || 1;

  useEffect(() => {
    setPaginaActual(1);
  }, [filtroEstado, filtroTecnico, filtroPrioridad, busqueda, filtroFecha]);

  useEffect(() => {
    getTecnicos().then(setListaTecnicos).catch(console.error);
  }, []);

  const mapaTecnicos = useMemo(() => {
    const mapa = new Map<string, string>();
    listaTecnicos.forEach(t => mapa.set(t.id, t.nombre));
    return mapa;
  }, [listaTecnicos]);

  const handleOrdenesChange = useCallback(() => {
    window.dispatchEvent(new Event('refetch-ordenes'));
  }, []);

  const handleProcesarOrden = async (orden: Orden) => {
    if (orden.estado === 'en proceso') return;
    const res = await procesarOrden(orden.id_orden_servicio, orden.estado);
    if (!res.success) {
      console.error(res.error);
      return;
    }

    // El correo al cliente ya NO se dispara desde aquí: un trigger en
    // orden_servicio (AFTER UPDATE OF estado) llama a la Edge Function
    // notificar-cliente-orden en cuanto peticion_queue aplica el cambio
    // de verdad, sin depender de que esta pestaña siga abierta.
  };

  const abrirPanelApoyos = (orden: Orden) => {
    setPanelApoyoOrden(orden);
  };

  const cerrarPanel = () => {
    setPanelApoyoOrden(null);
  };

  useRealtimeOrdenes(handleOrdenesChange);

  return (
    <>
      <Header title="Órdenes Pendientes" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Órdenes Pendientes</h1>
            <p>Gestiona y procesa las órdenes de servicio activas.</p>
          </div>
          {puedeGestionarOrdenes && (
            <button className="btn btn-primary" onClick={() => navigate('/nueva-orden')}>
              <Plus size={18} /> Nueva Orden
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="card card-context context-info" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div className="form-group">
              <label className="form-label">Búsqueda</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                <input
                  className="form-input"
                  placeholder="Cliente, equipo..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="en proceso">En proceso</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Técnico</label>
              <select className="form-select" value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)}>
                <option value="">Todos</option>
                {listaTecnicos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridad</label>
              <select className="form-select" value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
                <option value="">Todas</option>
                <option value="urgente">Urgente</option>
                <option value="alto">Alto</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de registro</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA o 00/MM/AAAA"
                  className="form-input"
                  style={{ flex: 1 }}
                  value={filtroFecha}
                  onChange={(e) => setFiltroFecha(e.target.value)}
                />
                <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={18} style={{ color: 'var(--sys-text-light)' }} />
                  <input
                    type="date"
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const [y, m, d] = val.split('-');
                        setFiltroFecha(`${d}/${m}/${y}`);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="card table-card animate-fade-in-up bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="w-full overflow-x-auto">
            {isLoading ? (
              <div className="p-10 text-center text-gray-500 font-medium">Cargando órdenes...</div>
            ) : listaOrdenes.length === 0 ? (
              <div className="p-10 text-center text-gray-500 font-medium">No se encontraron órdenes con estos filtros.</div>
            ) : (
              <table className="data-table w-full text-center min-w-max">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">N° Orden</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Cliente</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Equipo</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Prioridad</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Técnico</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Fecha</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Estado</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listaOrdenes.map((orden) => (
                    <tr key={orden.id_orden_servicio} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <span
                          className="text-[var(--sys-primary)] font-semibold cursor-pointer hover:underline"
                          onClick={() => navigate(`/orden/${orden.id_orden_servicio}`)}
                        >
                          #{orden.numero_orden}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-normal break-words max-w-[130px] mx-auto text-center leading-tight">
                        {nombreCliente(orden)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 whitespace-normal break-words max-w-[130px] mx-auto text-center leading-tight">
                        {orden.equipo ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center">
                          <PriorityBadge prioridad={orden.prioridad} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 whitespace-normal break-words max-w-[130px] mx-auto text-center leading-tight">
                        {mapaTecnicos.get(orden.responsable ?? '') || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">
                        {formatFecha(orden.created)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center">
                          <StatusBadge estado={orden.estado} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <button className="btn-icon hover:bg-blue-50" title="Ver detalle" onClick={() => navigate(`/orden/${orden.id_orden_servicio}`)}>
                            <Eye size={18} style={{ color: 'var(--sys-info)' }} />
                          </button>
                          {(puedeGestionarOrdenes || perfil?.id_perfil_info === orden.responsable) && (
                            <button className="btn-icon" title="Procesar orden" onClick={() => handleProcesarOrden(orden)}>
                              <Play size={18} style={{ color: 'var(--sys-primary)' }} />
                            </button>
                          )}
                          <button
                            className="btn-icon hover:bg-green-50"
                            title="Ver técnicos de apoyo"
                            onClick={() => abrirPanelApoyos(orden)}
                          >
                            <LucideUsers2 size={18} style={{ color: 'var(--sys-success)' }} />
                          </button>
                          {(puedeGestionarOrdenes || perfil?.id_perfil_info === orden.responsable) && (
                            <button className="btn-icon hover:bg-green-50" title="Cerrar orden" onClick={() => navigate(`/cerrar-orden/${orden.id_orden_servicio}`)}>
                              <CheckCircle size={18} style={{ color: 'var(--sys-success)' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--sys-border)', fontSize: 13, color: 'var(--sys-text-muted)' }}>
            <span>Página {paginaActual} de {totalPaginas} — {total} órdenes</span>
            <div className="pagination">
              <button className="pagination-btn" disabled={paginaActual === 1} onClick={() => setPaginaActual(p => p - 1)}>
                <ChevronLeft size={16} />
              </button>
              {(() => {
                let start = Math.max(1, paginaActual - 1);
                if (start + 2 > totalPaginas) start = Math.max(1, totalPaginas - 2);
                return Array.from({ length: Math.min(3, totalPaginas) }, (_, i) => start + i).map((p) => (
                  <button key={p} className={`pagination-btn ${paginaActual === p ? 'active' : ''}`} onClick={() => setPaginaActual(p)}>
                    {p}
                  </button>
                ));
              })()}
              <button className="pagination-btn" disabled={paginaActual === totalPaginas} onClick={() => setPaginaActual(p => p + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Técnicos de Apoyo */}
      <PanelTecnicosApoyo orden={panelApoyoOrden} onClose={cerrarPanel} />
    </>
  );
}