import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, RefreshCw, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, Wrench, AlertCircle,
} from 'lucide-react';
import Header from '../../components/Header';
import SummaryCard from '../../components/SummaryCard';
import StatusBadge from '../../components/StatusBadge';

import { formatFecha } from '../../../src/utils/dateFormatter';
import { useState, useEffect, useCallback } from 'react';
import { getDashboardOrdenes } from '../../../src/service/ordenes.service';
import type { Orden } from '../../../src/types';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Tooltip, Legend, ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { supabase } from '../../../src/utils/supabase';
import { useAuth } from '../../../src/context/AuthContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement);

export default function Dashboard() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ pendientes: 0, enProceso: 0, finalizadasHoy: 0, urgentes: 0 });
  const [recientes, setRecientes] = useState<Orden[]>([]);
  const { perfil } = useAuth();

  const [chartDataState, setChartDataState] = useState<{ labels: string[]; data: number[] }>({
    labels: ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'],
    data: [0, 0, 0, 0, 0, 0, 0],
  });

  // Distribución por estado para la segunda gráfica
  const [estadoStats, setEstadoStats] = useState({ pendiente: 0, enProceso: 0, finalizado: 0 });

  const hoy = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const procesarDatos = useCallback((data: Orden[]) => {
    const d = new Date();
    const hoyStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const pendientes = data.filter(o => o.estado === 'pendiente').length;
    const enProceso = data.filter(o => o.estado === 'en proceso').length;
    const urgentes = data.filter(o => o.prioridad === 'urgente' && o.estado !== 'finalizado').length;
    const finalizadasHoy = data.filter(o => {
      if (o.estado !== 'finalizado' || !o.finalized_at) return false;
      try {
        const fd = new Date(o.finalized_at);
        const fdStr = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}-${String(fd.getDate()).padStart(2, '0')}`;
        return fdStr === hoyStr;
      } catch { return false; }
    }).length;

    setStats({ pendientes, enProceso, finalizadasHoy, urgentes });
    setEstadoStats({
      pendiente: pendientes,
      enProceso,
      finalizado: data.filter(o => o.estado === 'finalizado').length,
    });

    // Ordenar por last_update para mostrar lo más recientemente modificado
    const getSortTime = (ord: any) => {
      let tLast = 0;
      let tCreated = 0;
      if (ord.last_update) tLast = new Date(ord.last_update).getTime();
      if (ord.created) tCreated = new Date(ord.created).getTime();
      return Math.max(isNaN(tLast) ? 0 : tLast, isNaN(tCreated) ? 0 : tCreated);
    };
    
    const sorted = [...data].sort((a, b) => getSortTime(b) - getSortTime(a));
    setRecientes(sorted.slice(0, 6));

    // --- Gráfica: semana actual lunes→domingo ---
    // Encontrar el lunes de la semana actual
    const todayDate = new Date();
    const diaSemana = todayDate.getDay(); // 0=dom, 1=lun ... 6=sab
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana; // días desde hoy hasta el lunes
    const lunes = new Date(todayDate);
    lunes.setDate(todayDate.getDate() + diffLunes);

    const nombresDias = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
    const tempLabels: string[] = [];
    const tempCounts: number[] = [];

    for (let i = 0; i < 7; i++) {
      const dia = new Date(lunes);
      dia.setDate(lunes.getDate() + i);
      const diaStr = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;

      tempLabels.push(nombresDias[i]);
      const count = data.filter(o => {
        if (!o.created) return false;
        const oc = new Date(o.created);
        const ocStr = `${oc.getFullYear()}-${String(oc.getMonth() + 1).padStart(2, '0')}-${String(oc.getDate()).padStart(2, '0')}`;
        return ocStr === diaStr;
      }).length;
      tempCounts.push(count);
    }

    // Marcar el día de hoy en el label
    const idxHoy = diaSemana === 0 ? 6 : diaSemana - 1;
    if (idxHoy >= 0 && idxHoy < 7) {
      tempLabels[idxHoy] = `${nombresDias[idxHoy]} ●`;
    }

    setChartDataState({ labels: tempLabels, data: tempCounts });
  }, []);

  // Carga inicial
  useEffect(() => {
    setIsLoading(true);
    getDashboardOrdenes()
      .then(procesarDatos)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [procesarDatos]);

  // Realtime — refresca silencioso
  useEffect(() => {
    const canal = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orden_servicio' },
        () => {
          getDashboardOrdenes().then(procesarDatos).catch(console.error);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [procesarDatos]);

  const chartData = {
    labels: chartDataState.labels,
    datasets: [{
      label: 'Órdenes creadas',
      data: chartDataState.data,
      backgroundColor: chartDataState.labels.map(l =>
        l.includes('●') ? 'rgba(26, 86, 219, 1)' : 'rgba(26, 86, 219, 0.55)'
      ),
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 36,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleFont: { family: 'Inter', weight: 600 as const },
        bodyFont: { family: 'Inter' },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          title: (items: any[]) => items[0].label.replace(' ●', ' (hoy)'),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 12 }, color: 'var(--sys-text-muted)' },
        border: { display: false },
      },
      y: {
        grid: { color: 'var(--sys-border-light)' },
        ticks: {
          font: { family: 'Inter', size: 12 },
          color: 'var(--sys-text-light)',
          // Solo enteros
          stepSize: 1,
          callback: (v: any) => Number.isInteger(v) ? v : null,
        },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  // Gráfica donut — distribución por estado
  const donutEstadoData = {
    labels: ['Pendientes', 'En proceso', 'Finalizadas'],
    datasets: [{
      data: [estadoStats.pendiente, estadoStats.enProceso, estadoStats.finalizado],
      backgroundColor: [
        'rgba(245, 158, 11, 0.85)',   // warning - pendiente
        'rgba(59, 130, 246, 0.85)',   // info - en proceso
        'rgba(16, 185, 129, 0.85)',   // success - finalizado
      ],
      borderWidth: 0,
      cutout: '62%',
    }],
  };

  const donutEstadoOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { size: 12, family: 'Inter' },
          padding: 14,
          usePointStyle: true,
          pointStyleWidth: 8,
          color: 'var(--sys-text-base)',
        },
      },
      tooltip: {
        backgroundColor: '#1e293b',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed}`,
        },
      },
    },
  };

  return (
    <>
      <Header title="Vista General" />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <h1>Hola, {perfil?.nombres} {perfil?.apellido_paterno}!</h1>
            <p>Aquí tienes el resumen de actividades de hoy.</p>
          </div>
          <div className="action-bar">
            <button className="btn btn-primary" onClick={() => navigate('/nueva-orden')}>
              <Plus size={18} /> Nueva orden
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/ordenes-pendientes')}>
              Ver órdenes pendientes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 w-full">
          <SummaryCard
            label="Pendientes"
            value={stats.pendientes}
            subtitle="Total activas sin asignar"
            icon={<ClipboardList size={20} />}
            variant="default"
            onClick={() => navigate('/ordenes-pendientes', { state: { filtroEstado: 'pendiente' } })}
          />
          <SummaryCard
            label="En proceso"
            value={stats.enProceso}
            subtitle="Asignadas a técnicos"
            icon={<RefreshCw size={20} />}
            variant="info"
            onClick={() => navigate('/ordenes-pendientes', { state: { filtroEstado: 'en proceso' } })}
          />
          <SummaryCard
            label="Cerradas hoy"
            value={stats.finalizadasHoy}
            subtitle="Finalizadas el día de hoy"
            icon={<CheckCircle2 size={20} />}
            variant="success"
            onClick={() => navigate('/historial', { state: { filtroFecha: hoy } })}
          />
          <SummaryCard
            label="Urgentes"
            value={stats.urgentes}
            subtitle="Requieren atención inmediata"
            icon={<AlertTriangle size={20} />}
            variant="danger"
            onClick={() => navigate('/ordenes-pendientes', { state: { filtroPrioridad: 'urgente' } })}
          />
        </div>

        <div className="content-grid-aside">
          <div className="card card-context context-info" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                Actividad Reciente
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ordenes-pendientes')} style={{ color: 'var(--sys-primary)' }}>
                Ver todas <ArrowRight size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
              {isLoading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-text-muted)' }}>
                  Cargando actividad...
                </div>
              ) : recientes.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-text-muted)' }}>
                  No hay actividad reciente.
                </div>
              ) : recientes.map((act, index) => (
                <div
                  key={act.id_orden_servicio}
                  onClick={() => navigate(`/orden/${act.id_orden_servicio}`)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '12px 8px',
                    borderBottom: index < recientes.length - 1 ? '1px solid var(--sys-border-light)' : 'none',
                    cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s',
                    flex: 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--sys-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: act.prioridad === 'urgente' ? 'var(--sys-danger-bg)'
                      : act.estado === 'finalizado' ? 'var(--sys-success-bg)' : 'var(--sys-info-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {act.prioridad === 'urgente'
                      ? <AlertCircle size={18} style={{ color: 'var(--sys-danger)' }} />
                      : act.estado === 'finalizado'
                        ? <CheckCircle2 size={18} style={{ color: 'var(--sys-success)' }} />
                        : <Wrench size={18} style={{ color: 'var(--sys-info)' }} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-primary)' }}>
                          #{act.numero_orden}
                        </span>
                        <StatusBadge estado={act.estado} />
                        {/* Etiqueta nuevo vs editado */}
                        {(act as any).last_update && (act as any).last_update !== act.created ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                            background: 'var(--sys-warning-bg)', color: 'var(--sys-warning)',
                          }}>
                            editado
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                            background: 'var(--sys-success-bg)', color: 'var(--sys-success)',
                          }}>
                            nuevo
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--sys-text-light)', flexShrink: 0 }}>
                        {(act as any).last_update
                          ? formatFecha((act as any).last_update)
                          : act.created
                            ? formatFecha(act.created)
                            : '—'}
                      </span>
                    </div>
                    {act.equipo && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sys-text-dark)', marginBottom: 2 }}>
                        {act.equipo}
                      </div>
                    )}
                    <p style={{
                      fontSize: 12, color: 'var(--sys-text-muted)', margin: 0, lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {act.problema ?? 'Sin descripción'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-context context-success" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* --- Gráfica de barras: creación por día --- */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
                  Órdenes esta semana
                </h3>
                <span style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>
                  Lun → Dom · ● hoy
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 16px' }}>
                Órdenes creadas por día en la semana actual.
              </p>
              <div style={{ height: 200 }}>
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>

            {/* Divisor */}
            <div style={{ borderTop: '1px solid var(--sys-border-light)', margin: '20px 0' }} />

            {/* --- Donut: distribución por estado --- */}
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sys-text-dark)', margin: '0 0 4px' }}>
                Estado del sistema
              </h3>
              <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '0 0 14px' }}>
                Distribución actual de todas las órdenes registradas.
              </p>
              {estadoStats.pendiente + estadoStats.enProceso + estadoStats.finalizado === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--sys-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  Sin órdenes registradas.
                </p>
              ) : (
                <div style={{ height: 200 }}>
                  <Doughnut data={donutEstadoData} options={donutEstadoOptions} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}