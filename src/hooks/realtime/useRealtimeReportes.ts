import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../utils/supabase';
import { getStatsFiltradas, getStatsPorCliente } from '../../service/stats.service';
import { getTecnicosStats } from '../../service/usuarios.service';


export interface FiltrosReportes {
  filtroTecnico: string;
  filtroFechaInicio: string;
  filtroFechaFin: string;
}

interface ReportesCallbacks {
  onUpdate: (data: {
    statsGlobales: {
      ordenesFinalizadas: number;
      totalOrdenes: number;
      ordenesPendientes: number;
      ordenesEnProceso: number;
      tiempoPromResolucionHs: number;
      reasignacionesProm: number;
    };
    statsPorPrioridad: any[];
    statsPorTecnico: any[];
    statsPorCliente: any[];
    tendencia: any[];
    topReasignadas: any[];
    listaTecnicos: { id: string; nombre: string }[];
    statsDisponibles: boolean;
  }) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function useRealtimeReportes({ onUpdate, onLoadingChange }: ReportesCallbacks) {
  const filtrosRef = useRef<{ aplican: boolean; valores: FiltrosReportes }>({
    aplican: false,
    valores: { filtroTecnico: '', filtroFechaInicio: '', filtroFechaFin: '' },
  });

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (
    nuevosFiltros?: FiltrosReportes,
    opciones: { silent?: boolean } = {}
  ) => {
    if (nuevosFiltros) {
      filtrosRef.current = { aplican: true, valores: nuevosFiltros };
    }
    const { aplican, valores } = filtrosRef.current;
    const { silent = false } = opciones;

    const myId = ++requestIdRef.current;
    if (!silent) onLoadingChange(true);

    try {
      const [tecRes, statsResult, cliStatsRes] = await Promise.all([
        getTecnicosStats(),
        aplican
          ? getStatsFiltradas(
            valores.filtroTecnico || undefined,
            valores.filtroFechaInicio || undefined,
            valores.filtroFechaFin || undefined
          )
          : getStatsFiltradas(),
        getStatsPorCliente(),
      ]);

      if (myId !== requestIdRef.current) return;

      // getStatsFiltradas ahora retorna { disponible, data }
      // Si no hay internet (disponible=false), statsData será null
      const statsData = statsResult.disponible ? statsResult.data : null;

      onUpdate({
        statsGlobales: {
          ordenesFinalizadas: statsData?.ordenes_finalizadas || 0,
          totalOrdenes:       statsData?.total_ordenes       || 0,
          ordenesPendientes:  statsData?.ordenes_pendientes  || 0,
          ordenesEnProceso:   statsData?.ordenes_en_proceso  || 0,
          tiempoPromResolucionHs: statsData?.tiempo_prom_resolucion_hs || 0,
          reasignacionesProm: statsData?.reasignaciones_prom || 0,
        },
        statsPorPrioridad: statsData?.por_prioridad  || [],
        statsPorTecnico:   statsData?.por_tecnico    || [],
        statsPorCliente:   cliStatsRes || [],
        tendencia:         statsData?.tendencia       || [],
        topReasignadas:    statsData?.top_reasignadas || [],
        listaTecnicos:     tecRes || [],
        // Pasar si las stats principales están disponibles o no (sin internet)
        statsDisponibles:  statsResult.disponible,
      });
    } catch (err) {
      console.error('Error al cargar reportes:', err);
    } finally {
      if (myId === requestIdRef.current && !silent) onLoadingChange(false);
    }
  }, [onUpdate, onLoadingChange]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    fetchDataRef.current();
  }, []);

  useEffect(() => {
    const canal = supabase.channel(`realtime-reportes-${Math.random().toString(36).slice(2)}`);

    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orden_servicio' },
      () => {
        fetchDataRef.current(undefined, { silent: true });
      }
    );

    canal.subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  return { fetchData };
}