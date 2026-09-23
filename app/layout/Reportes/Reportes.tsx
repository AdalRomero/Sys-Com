import { useState } from 'react';
import { Printer, FileText, FileSpreadsheet, CheckCircle2, ClipboardList, Clock, Filter, RefreshCw } from 'lucide-react';
import Header from '../../components/Header';
import SummaryCard from '../../components/SummaryCard';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);
import { useRealtimeReportes, type FiltrosReportes } from '../../../src/hooks/realtime';
import { descargarCsvMultiseccion } from '../../../src/utils/exportCsv';

export default function Reportes() {
  const fechaLocal = (d: Date = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Estos son solo los valores del FORMULARIO (lo que el usuario está
  // editando). El hook decide por su cuenta cuándo "aplican" o no —
  // recién cuando se llama a fetchData con un valor explícito.
  const [filtroFechaInicio, setFiltroFechaInicio] = useState(() => {
    const d = new Date();
    return fechaLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [filtroFechaFin, setFiltroFechaFin] = useState(() => fechaLocal());
  const [filtroTecnico, setFiltroTecnico] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [statsDisponibles, setStatsDisponibles] = useState(true);
  const [listaTecnicos, setListaTecnicos] = useState<{ id: string; nombre: string }[]>([]);
  const [statsGlobales, setStatsGlobales] = useState({
    ordenesFinalizadas: 0,
    totalOrdenes: 0,
    ordenesPendientes: 0,
    ordenesEnProceso: 0,
    tiempoPromResolucionHs: 0,
    reasignacionesProm: 0,
  });
  const [statsPorPrioridad, setStatsPorPrioridad] = useState<any[]>([]);
  const [statsPorTecnico, setStatsPorTecnico] = useState<any[]>([]);
  const [statsPorCliente, setStatsPorCliente] = useState<any[]>([]);
  const [tendencia, setTendencia] = useState<any[]>([]);
  const [topReasignadas, setTopReasignadas] = useState<any[]>([]);

  const handleUpdate = (data: any) => {
    setListaTecnicos(data.listaTecnicos);
    setStatsGlobales(data.statsGlobales);
    setStatsPorPrioridad(data.statsPorPrioridad);
    setStatsPorTecnico(data.statsPorTecnico);
    setStatsPorCliente(data.statsPorCliente);
    setTendencia(data.tendencia || []);
    setTopReasignadas(data.topReasignadas || []);
    setStatsDisponibles(data.statsDisponibles ?? true);
  };

  const { fetchData } = useRealtimeReportes({
    onUpdate: handleUpdate,
    onLoadingChange: setIsLoading,
  });

  const handleAplicar = () => {
    const filtros: FiltrosReportes = {
      filtroTecnico,
      filtroFechaInicio,
      filtroFechaFin,
    };
    fetchData(filtros);
  };

  // Función auxiliar para leer variables CSS y pasarlas a chart.js
  const getCssVar = (varName: string) => {
    if (typeof window !== 'undefined') {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#ccc';
    }
    return '#ccc';
  };

  // Gráfica donut — Distribución por Prioridad
  const prioridadColorMap: Record<string, string> = {
    urgente: getCssVar('--sys-danger'),
    alto: getCssVar('--sys-warning'),
    media: getCssVar('--sys-primary'),
    baja: getCssVar('--sys-success'),
  };

  const donutData = {
    labels: statsPorPrioridad.map((d) => d.prioridad.charAt(0).toUpperCase() + d.prioridad.slice(1)),
    datasets: [
      {
        data: statsPorPrioridad.map((d) => d.total),
        backgroundColor: statsPorPrioridad.map((d) => prioridadColorMap[d.prioridad] || getCssVar('--sys-text-muted')),
        borderWidth: 0,
        cutout: '65%',
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { font: { size: 12, family: 'Inter' }, padding: 16, usePointStyle: true, pointStyleWidth: 8 },
      },
      tooltip: { backgroundColor: getCssVar('--sys-text-dark'), cornerRadius: 8, padding: 10 },
    },
  };

  // Gráfica de barras — Rendimiento por técnico (finalizadas vs. carga actual)
  const barData = {
    labels: statsPorTecnico.map((d) => d.nombre_tecnico),
    datasets: [
      {
        label: 'Finalizadas (período)',
        data: statsPorTecnico.map((d) => d.finalizadas),
        backgroundColor: getCssVar('--sys-primary'),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 18,
      },
      {
        label: 'Carga actual (pendientes + en proceso)',
        data: statsPorTecnico.map((d) => d.carga_actual),
        backgroundColor: getCssVar('--sys-warning'),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 18,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    categoryPercentage: 0.6,
    barPercentage: 0.9,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { font: { size: 12 }, usePointStyle: true, pointStyleWidth: 8 },
      },
      tooltip: { backgroundColor: getCssVar('--sys-text-dark'), cornerRadius: 8, padding: 10 },
    },
    scales: {
      x: { grid: { color: getCssVar('--sys-border-light') }, ticks: { font: { size: 12 }, color: getCssVar('--sys-text-light') }, border: { display: false }, beginAtZero: true },
      y: {
        grid: { display: false },
        ticks: {
          font: { size: 12, weight: 500 as const },
          color: getCssVar('--sys-text-base'),
          crossAlign: 'center' as const,
          autoSkip: false,
        },
        border: { display: false },
      },
    },
  };

  // Gráfica de barras — Cumplimiento por prioridad (tiempo prom. de resolución)
  const prioridadTiempoData = {
    labels: statsPorPrioridad.map((d) => d.prioridad.charAt(0).toUpperCase() + d.prioridad.slice(1)),
    datasets: [
      {
        label: 'Tiempo prom. resolución (hrs)',
        data: statsPorPrioridad.map((d) => d.tiempo_prom_resolucion_hs ?? 0),
        backgroundColor: statsPorPrioridad.map((d) => prioridadColorMap[d.prioridad] || getCssVar('--sys-text-muted')),
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 40,
      },
    ],
  };

  const prioridadTiempoOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: getCssVar('--sys-text-dark'), cornerRadius: 8, padding: 10 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 12 }, color: getCssVar('--sys-text-base') }, border: { display: false } },
      y: { grid: { color: getCssVar('--sys-border-light') }, ticks: { font: { size: 12 }, color: getCssVar('--sys-text-light') }, border: { display: false }, beginAtZero: true },
    },
  };

  // Gráfica de línea — Tendencia semanal: creadas vs. cerradas
  const tendenciaData = {
    labels: tendencia.map((d) =>
      new Date(d.periodo + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
    ),
    datasets: [
      {
        label: 'Creadas',
        data: tendencia.map((d) => d.creadas),
        borderColor: getCssVar('--sys-primary'),
        backgroundColor: getCssVar('--sys-primary'),
        pointBackgroundColor: getCssVar('--sys-primary'),
        borderWidth: 2.5,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
      {
        label: 'Cerradas',
        data: tendencia.map((d) => d.cerradas),
        borderColor: getCssVar('--sys-success'),
        backgroundColor: getCssVar('--sys-success'),
        pointBackgroundColor: getCssVar('--sys-success'),
        borderWidth: 2.5,
        borderDash: [5, 3],
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const tendenciaOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' as const, labels: { font: { size: 12 }, usePointStyle: true, pointStyleWidth: 8 } },
      tooltip: { backgroundColor: getCssVar('--sys-text-dark'), cornerRadius: 8, padding: 10 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: getCssVar('--sys-text-light') }, border: { display: false } },
      y: { grid: { color: getCssVar('--sys-border-light') }, ticks: { font: { size: 12 }, color: getCssVar('--sys-text-light') }, border: { display: false }, beginAtZero: true },
    },
  };

  // ---- Exportar / Imprimir ----
  const handleImprimir = () => window.print();

  const handleExportarPdf = () => {
    // Sin librería de generación de PDF en el proyecto: usamos el diálogo
    // de impresión del navegador, que permite "Guardar como PDF".
    window.print();
  };

  const handleDescargarExcel = () => {
    descargarCsvMultiseccion(`reportes_syscom_${filtroFechaInicio}_a_${filtroFechaFin}`, [
      {
        titulo: 'Resumen global',
        columnas: [
          { clave: 'metrica', etiqueta: 'Métrica' },
          { clave: 'valor', etiqueta: 'Valor' },
        ],
        filas: [
          { metrica: 'Total de órdenes', valor: statsGlobales.totalOrdenes },
          { metrica: 'Órdenes finalizadas', valor: statsGlobales.ordenesFinalizadas },
          { metrica: 'Órdenes pendientes', valor: statsGlobales.ordenesPendientes },
          { metrica: 'Órdenes en proceso', valor: statsGlobales.ordenesEnProceso },
          { metrica: 'Tiempo prom. resolución (hrs)', valor: statsGlobales.tiempoPromResolucionHs },
          { metrica: 'Reasignaciones promedio por orden', valor: statsGlobales.reasignacionesProm },
        ],
      },
      {
        titulo: 'Por prioridad',
        columnas: [
          { clave: 'prioridad', etiqueta: 'Prioridad' },
          { clave: 'total', etiqueta: 'Total órdenes' },
          { clave: 'tiempo_prom_resolucion_hs', etiqueta: 'Tiempo prom. resolución (hrs)' },
        ],
        filas: statsPorPrioridad,
      },
      {
        titulo: 'Por técnico',
        columnas: [
          { clave: 'nombre_tecnico', etiqueta: 'Técnico' },
          { clave: 'finalizadas', etiqueta: 'Finalizadas (período)' },
          { clave: 'tiempo_prom_resolucion_hs', etiqueta: 'Tiempo prom. resolución (hrs)' },
          { clave: 'pendientes', etiqueta: 'Pendientes (hoy)' },
          { clave: 'en_proceso', etiqueta: 'En proceso (hoy)' },
          { clave: 'carga_actual', etiqueta: 'Carga actual (hoy)' },
          { clave: 'apoyos_brindados', etiqueta: 'Apoyos brindados' },
        ],
        filas: statsPorTecnico,
      },
      {
        titulo: 'Top clientes frecuentes',
        columnas: [
          { clave: 'empresa', etiqueta: 'Cliente / Empresa' },
          { clave: 'total_ordenes', etiqueta: 'Total órdenes' },
          { clave: 'tiempo_prom_resolucion_hs', etiqueta: 'Tiempo prom. resolución (hrs)' },
        ],
        filas: statsPorCliente,
      },
      {
        titulo: 'Órdenes más reasignadas',
        columnas: [
          { clave: 'numero_orden', etiqueta: 'N° Orden' },
          { clave: 'veces_reasignada', etiqueta: 'Veces reasignada' },
        ],
        filas: topReasignadas,
      },
      {
        titulo: 'Tendencia semanal',
        columnas: [
          { clave: 'periodo', etiqueta: 'Semana' },
          { clave: 'creadas', etiqueta: 'Creadas' },
          { clave: 'cerradas', etiqueta: 'Cerradas' },
        ],
        filas: tendencia,
      },
    ]);
  };

  return (
    <>
      <Header title="Reportes" />
      <div className="app-content">
        {/* Encabezado */}
        <div className="page-heading">
          <div>
            <h1>Reportes y Analíticas</h1>
            <p>Estadísticas extraídas de las vistas globales y de auditoría de la base de datos.</p>
          </div>
          <div className="action-bar">
            <button className="btn btn-secondary btn-sm" onClick={handleImprimir}>
              <Printer size={14} /> Imprimir
            </button>
            <button className="btn btn-outline-danger btn-sm" onClick={handleExportarPdf}>
              <FileText size={14} /> Exportar PDF
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={handleDescargarExcel}>
              <FileSpreadsheet size={14} /> Descargar Excel
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="card card-context context-info" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}>
            <div className="form-group">
              <label className="form-label">Fecha Inicio</label>
              <input
                className="form-input"
                type="date"
                value={filtroFechaInicio}
                onChange={(e) => setFiltroFechaInicio(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Fin</label>
              <input
                className="form-input"
                type="date"
                value={filtroFechaFin}
                onChange={(e) => setFiltroFechaFin(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Técnico</label>
              <select
                className="form-select"
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
              >
                <option value="">Todos los técnicos</option>
                {listaTecnicos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleAplicar}
                disabled={isLoading}
              >
                <Filter size={16} /> {isLoading ? 'Cargando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>

        {/* Tarjetas resumen */}
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sys-text-muted)' }}>
            Cargando reportes...
          </div>
        ) : !statsDisponibles ? (
          <div className="card card-context context-warning" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--sys-text-dark)', fontWeight: 600, margin: '0 0 8px' }}>
              Los reportes requieren conexión a internet
            </p>
            <p style={{ fontSize: 13, color: 'var(--sys-text-muted)', margin: 0 }}>
              Esta sección usa funciones del servidor que no pueden replicarse offline.
              Conéctate a internet y presiona <strong>Aplicar</strong> para ver los reportes.
            </p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 18, color: 'var(--sys-text-dark)', marginBottom: 16 }}>Estadísticas Globales</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 w-full">
              <SummaryCard
                label="Órdenes cerradas"
                value={statsGlobales.ordenesFinalizadas}
                subtitle={`De ${statsGlobales.totalOrdenes} órdenes totales`}
                icon={<CheckCircle2 size={20} />}
                variant="success"
              />
              <SummaryCard
                label="Órdenes pendientes"
                value={statsGlobales.ordenesPendientes}
                subtitle={`${statsGlobales.ordenesEnProceso} en proceso`}
                icon={<ClipboardList size={20} />}
                variant="info"
              />
              <SummaryCard
                label="Tiempo prom. resolución"
                value={`${statsGlobales.tiempoPromResolucionHs} hrs`}
                subtitle="Basado en historial de auditoría"
                icon={<Clock size={20} />}
                variant="default"
              />
              <SummaryCard
                label="Reasignaciones prom."
                value={statsGlobales.reasignacionesProm}
                subtitle="Traspasos promedio por orden"
                icon={<RefreshCw size={20} />}
                variant="warning"
              />
            </div>

            {/* Gráficas principales */}
            <div className="content-grid-two">
              {/* Distribución por Prioridad */}
              <div className="card card-context context-warning animate-fade-in-up">
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 20px' }}>
                  Distribución por Prioridad
                </h3>
                <div style={{ height: 260, position: 'relative', width: '100%' }}>
                  {statsPorPrioridad.length > 0
                    ? <Doughnut key={`donut-${statsPorPrioridad.length}`} data={donutData} options={donutOptions} />
                    : <p style={{ color: 'var(--sys-text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 80 }}>Sin datos para el filtro aplicado.</p>
                  }
                </div>
              </div>

              {/* Top Clientes */}
              <div className="card card-context context-info animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 20px' }}>
                  Top Clientes Frecuentes
                </h3>
                <div className="w-full overflow-x-auto">
                  <table className="data-table w-full text-center">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200">
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Cliente / Empresa</th>
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Total Órdenes</th>
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Tiempo prom. resolución</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statsPorCliente.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-10 text-center text-gray-500 font-medium">
                            Sin datos de clientes frecuentes
                          </td>
                        </tr>
                      ) : (
                        statsPorCliente.map((cliente, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-normal break-words max-w-[130px] mx-auto text-center leading-tight">
                              {cliente.empresa}
                            </td>
                            <td className="px-5 py-3.5 text-center font-semibold text-[var(--sys-primary)] whitespace-nowrap">
                              {cliente.total_ordenes}
                            </td>
                            <td className="px-5 py-3.5 text-center text-gray-600 whitespace-nowrap">
                              {cliente.tiempo_prom_resolucion_hs != null ? `${cliente.tiempo_prom_resolucion_hs} hrs` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Cumplimiento por prioridad + Tendencia semanal */}
            <div className="content-grid-two" style={{ marginTop: 24 }}>
              <div className="card card-context context-danger animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 4px' }}>
                  Cumplimiento por Prioridad
                </h3>
                <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 16px' }}>
                  Tiempo promedio de resolución desglosado — no un solo promedio global.
                </p>
                <div style={{ height: 240, position: 'relative', width: '100%' }}>
                  {statsPorPrioridad.length > 0
                    ? <Bar key={`prioridad-tiempo-${statsPorPrioridad.length}`} data={prioridadTiempoData} options={prioridadTiempoOptions} />
                    : <p style={{ color: 'var(--sys-text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 80 }}>Sin datos para el filtro aplicado.</p>
                  }
                </div>
              </div>

              <div className="card card-context context-info animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 4px' }}>
                  Tendencia Semanal
                </h3>
                <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 16px' }}>
                  Órdenes creadas vs. cerradas por semana.
                </p>
                <div style={{ height: 240, position: 'relative', width: '100%' }}>
                  {tendencia.length > 0
                    ? <Line key={`tendencia-${tendencia.length}`} data={tendenciaData} options={tendenciaOptions} />
                    : <p style={{ color: 'var(--sys-text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 80 }}>Sin datos para el filtro aplicado.</p>
                  }
                </div>
              </div>
            </div>

            {/* Rendimiento y carga por técnico */}
            <div className="card card-context context-success animate-fade-in-up" style={{ marginTop: 24, marginBottom: 24, animationDelay: '0.12s' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 4px' }}>
                Rendimiento y Carga por Técnico
              </h3>
              <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 16px' }}>
                "Finalizadas" es del período filtrado. "Carga actual" es un snapshot de hoy (no depende del filtro de fechas).
              </p>
              <div style={{ height: 280, marginBottom: 24, position: 'relative', width: '100%' }}>
                {statsPorTecnico.length > 0
                  ? <Bar key={`tecnico-${statsPorTecnico.length}`} data={barData} options={barOptions} />
                  : <p style={{ color: 'var(--sys-text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 80 }}>Sin datos para el filtro aplicado.</p>
                }
              </div>

              {statsPorTecnico.length > 0 && (
                <div className="w-full overflow-x-auto">
                  <table className="data-table w-full text-center">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200">
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Técnico</th>
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Finalizadas</th>
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Tiempo prom. resolución</th>
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Carga actual (hoy)</th>
                        <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Apoyos brindados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statsPorTecnico.map((t, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-800 text-center">{t.nombre_tecnico}</td>
                          <td className="px-5 py-3.5 text-center font-semibold text-[var(--sys-primary)]">{t.finalizadas}</td>
                          <td className="px-5 py-3.5 text-center text-gray-600">
                            {t.tiempo_prom_resolucion_hs != null ? `${t.tiempo_prom_resolucion_hs} hrs` : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className="badge"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: t.carga_actual > 5 ? 'var(--sys-danger-bg)' : 'var(--sys-warning-bg)',
                                color: t.carga_actual > 5 ? 'var(--sys-danger-text)' : 'var(--sys-warning-text)',
                                padding: '4px 12px',
                                borderRadius: 999,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t.carga_actual} ({t.pendientes} pend. + {t.en_proceso} proc.)
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center text-gray-600">{t.apoyos_brindados}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Órdenes más reasignadas */}
            <div className="card card-context context-warning animate-fade-in-up" style={{ marginBottom: 24, animationDelay: '0.14s' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 4px' }}>
                Órdenes con Más Reasignaciones
              </h3>
              <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 16px' }}>
                Si una orden se traspasó varias veces antes de cerrarse, suele indicar una falla en la planificación inicial.
              </p>
              <div className="w-full overflow-x-auto">
                <table className="data-table w-full text-center">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">N° Orden</th>
                      <th className="px-5 py-4 font-semibold text-gray-700 text-sm tracking-wide text-center">Veces Reasignada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topReasignadas.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="p-10 text-center text-gray-500 font-medium">
                          Ninguna orden del período fue reasignada.
                        </td>
                      </tr>
                    ) : (
                      topReasignadas.map((r, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-800">#{r.numero_orden}</td>
                          <td className="px-5 py-3.5 text-center font-semibold text-[var(--sys-warning)]">{r.veces_reasignada}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Estilos solo para impresión / exportar a PDF: oculta filtros y acciones */}
      <style>{`
        @media print {
          .action-bar, .card-context.context-info:has(input[type="date"]) { display: none !important; }
          .app-content { padding: 0 !important; }
        }
      `}</style>
    </>
  );
}