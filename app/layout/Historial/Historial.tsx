import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, Search, ChevronLeft, ChevronRight, LucideUsers2, Calendar } from 'lucide-react';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import PanelTecnicosApoyo from '../../components/Paneltecnicosapoyo';
import { formatFecha } from '../../../src/utils/dateFormatter';
import { getOrdenesFinalizadas } from '../../../src/service/ordenes.service';
import { getTecnicos } from '../../../src/service/usuarios.service';
import { supabase } from '../../../src/utils/supabase';
import type { OrdenFinalizada } from '../../../src/types';

const nombreCliente = (orden: OrdenFinalizada): string => orden.cliente?.nombre || '—';
const nombrePerfil = (orden: OrdenFinalizada): string => {
  const p = orden.responsable_perfil;
  return p ? `${p.nombres} ${p.apellido_paterno} ${p.apellido_materno ?? ''}`.trim() : '—';
};
export default function Historial() {
  const navigate = useNavigate();
  const location = useLocation();

  const [busqueda, setBusqueda] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<string>(location.state?.filtroFecha || '');
  const [paginaActual, setPaginaActual] = useState(1);
  const porPagina = 5;

  const [isLoading, setIsLoading] = useState(true);
  const [listaOrdenes, setListaOrdenes] = useState<OrdenFinalizada[]>([]);
  const [totalOrdenes, setTotalOrdenes] = useState(0);
  const [listaTecnicos, setListaTecnicos] = useState<{ id: string; nombre: string }[]>([]);

  // Panel de técnicos de apoyo (solo lectura, orden ya cerrada)
  const [panelApoyoOrden, setPanelApoyoOrden] = useState<OrdenFinalizada | null>(null);

  const fetchHistorial = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    try {
      const [ordenesRes, tecnicosRes] = await Promise.all([
        getOrdenesFinalizadas(paginaActual, porPagina, {
          responsable: filtroTecnico || undefined,
          prioridad: filtroPrioridad || undefined,
          busqueda: busqueda || undefined,
          fecha: filtroFecha || undefined,
        }),
        getTecnicos(),
      ]);
      setListaOrdenes(ordenesRes.data as unknown as OrdenFinalizada[]);
      setTotalOrdenes(ordenesRes.count);
      setListaTecnicos(tecnicosRes);
    } catch (err) {
      console.error('Error al cargar historial', err);
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  }, [paginaActual, filtroTecnico, filtroPrioridad, busqueda, filtroFecha]);

  useEffect(() => {
    fetchHistorial();
  }, [fetchHistorial]);

  useEffect(() => {
    const canal = supabase
      .channel('historial-ordenes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orden_servicio' },
        (payload) => {
          if ((payload.new as any)?.estado === 'finalizado') {
            fetchHistorial(true);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orden_servicio' },
        () => fetchHistorial(true)
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [fetchHistorial]);

  const totalPaginas = Math.ceil(totalOrdenes / porPagina) || 1;

  return (
    <>
      <Header title="Historial de Órdenes" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Historial de Órdenes</h1>
            <p>Registro de órdenes finalizadas.</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="card card-context context-info p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="form-group w-full">
              <label className="form-label block mb-1.5 font-medium text-sm text-gray-700">Búsqueda</label>
              <div className="relative w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="form-input w-full py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Cliente, equipo..."
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPaginaActual(1); }}
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </div>

            <div className="form-group w-full">
              <label className="form-label block mb-1.5 font-medium text-sm text-gray-700">Técnico</label>
              <select
                className="form-select w-full py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={filtroTecnico}
                onChange={(e) => { setFiltroTecnico(e.target.value); setPaginaActual(1); }}
              >
                <option value="">Todos</option>
                {listaTecnicos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group w-full">
              <label className="form-label block mb-1.5 font-medium text-sm text-gray-700">Prioridad</label>
              <select
                className="form-select w-full py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={filtroPrioridad}
                onChange={(e) => { setFiltroPrioridad(e.target.value); setPaginaActual(1); }}
              >
                <option value="">Todas</option>
                <option value="urgente">Urgente</option>
                <option value="alto">Alto</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>

            <div className="form-group w-full">
              <label className="form-label block mb-1.6 font-medium text-sm text-gray-700">Fecha de cierre</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA o 00/MM/AAAA"
                  className="form-input w-full py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  style={{ flex: 1 }}
                  value={filtroFecha}
                  onChange={(e) => { setFiltroFecha(e.target.value); setPaginaActual(1); }}
                />
                <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={18} style={{ color: '#9ca3af' }} />
                  <input
                    type="date"
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const [y, m, d] = val.split('-');
                        setFiltroFecha(`${d}/${m}/${y}`);
                        setPaginaActual(1);
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
              <div className="p-10 text-center text-gray-500 font-medium">
                Cargando historial...
              </div>
            ) : listaOrdenes.length === 0 ? (
              <div className="p-10 text-center text-gray-500 font-medium">
                No se encontraron órdenes finalizadas con estos filtros.
              </div>
            ) : (
              <table className="data-table w-full text-center min-w-max">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">N° Orden</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Cliente</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Equipo</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Prioridad</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Técnico</th>
                    <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide whitespace-nowrap text-center">Fecha cierre</th>
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
                        {nombrePerfil(orden)}
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">
                        {orden.finalized_at
                          ? formatFecha(orden.finalized_at)
                          : '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center">
                          <StatusBadge estado={orden.estado} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            className="btn-icon p-1.5 rounded-lg text-gray-400 hover:text-[var(--sys-info)] hover:bg-blue-50 transition-all opacity-70 group-hover:opacity-100"
                            title="Ver detalle"
                            onClick={() => navigate(`/orden/${orden.id_orden_servicio}`)}
                          >
                            <Eye size={20} />
                          </button>
                          <button
                            className="btn-icon p-1.5 rounded-lg text-gray-400 hover:text-[var(--sys-success)] hover:bg-green-50 transition-all opacity-70 group-hover:opacity-100"
                            title="Ver técnicos de apoyo"
                            onClick={() => setPanelApoyoOrden(orden)}
                          >
                            <LucideUsers2 size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 text-sm text-gray-500 bg-gray-50/30 rounded-b-xl">
            <span className="font-medium">
              Mostrando {Math.min((paginaActual - 1) * porPagina + 1, totalOrdenes)}–{Math.min(paginaActual * porPagina, totalOrdenes)} de {totalOrdenes} órdenes
            </span>
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={paginaActual === 1}
                onClick={() => setPaginaActual(p => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              {(() => {
                let start = Math.max(1, paginaActual - 1);
                if (start + 2 > totalPaginas) start = Math.max(1, totalPaginas - 2);
                return Array.from({ length: Math.min(3, totalPaginas) }, (_, i) => start + i).map((p) => (
                  <button
                    key={p}
                    className={`pagination-btn ${paginaActual === p ? 'active' : ''}`}
                    onClick={() => setPaginaActual(p)}
                  >
                    {p}
                  </button>
                ));
              })()}
              <button
                className="pagination-btn"
                disabled={paginaActual === totalPaginas}
                onClick={() => setPaginaActual(p => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Técnicos de Apoyo (solo lectura) */}
      <PanelTecnicosApoyo
        orden={panelApoyoOrden}
        onClose={() => setPanelApoyoOrden(null)}
        readOnly
      />
    </>
  );
}