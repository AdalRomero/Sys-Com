import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getNotificaciones,
  marcarNotificacionLeida,
  marcarNotificacionCompletada,
  marcarTodasLeidas,
  eliminarNotificacion,
} from '../service/notificaciones.service';
import { useRealtimeNotificaciones } from './realtime';
import type { Notificacion } from '../types';

// Ranking de urgencia para ordenar la vista: primero lo no leído,
// luego por prioridad/tipo más urgente, luego lo más reciente.
const rankPrioridad: Record<string, number> = { urgente: 4, alto: 3, media: 2, baja: 1 };
const rankTipo: Record<string, number> = { alert: 3, warning: 2, info: 1, success: 0 };

const ordenarNotificaciones = (lista: Notificacion[]): Notificacion[] => {
  return [...lista].sort((a, b) => {
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
    const rankA = (a.prioridad ? rankPrioridad[a.prioridad] : 0) + rankTipo[a.tipo];
    const rankB = (b.prioridad ? rankPrioridad[b.prioridad] : 0) + rankTipo[b.tipo];
    if (rankA !== rankB) return rankB - rankA;
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });
};

export const useNotificaciones = (idUsuario: string | undefined) => {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const idUsuarioRef = useRef(idUsuario);
  useEffect(() => { idUsuarioRef.current = idUsuario; }, [idUsuario]);

  const fetchData = useCallback(async (silencioso = false) => {
    const id = idUsuarioRef.current;
    if (!id) {
      setNotificaciones([]);
      setIsLoading(false);
      return;
    }
    if (!silencioso) setIsLoading(true);
    try {
      const { data } = await getNotificaciones(id);
      setNotificaciones(ordenarNotificaciones(data));
    } catch (err) {
      console.error('Error cargando notificaciones:', err);
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  }, []);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; });

  useEffect(() => {
    fetchData();
  }, [idUsuario, fetchData]);

  // Realtime: cualquier INSERT/UPDATE/DELETE en notificaciones (filtrado por
  // RLS a solo las del propio usuario) dispara un refetch silencioso —
  // así una notificación "nueva" aparece al instante sin recargar la página.
  useRealtimeNotificaciones(useCallback(() => fetchDataRef.current(true), []));

  const unreadCount = notificaciones.filter(n => !n.is_read).length;

  const marcarLeida = useCallback(async (id: string) => {
    setNotificaciones(prev => ordenarNotificaciones(
      prev.map(n => n.id_notificacion === id ? { ...n, is_read: true } : n)
    ));
    const res = await marcarNotificacionLeida(id);
    if (!res.success) fetchDataRef.current(true);
  }, []);

  const marcarCompletada = useCallback(async (id: string) => {
    setNotificaciones(prev => ordenarNotificaciones(
      prev.map(n => n.id_notificacion === id ? { ...n, is_completed: true, is_read: true } : n)
    ));
    const res = await marcarNotificacionCompletada(id);
    if (!res.success) fetchDataRef.current(true);
  }, []);

  const marcarTodasComoLeidas = useCallback(async () => {
    const id = idUsuarioRef.current;
    if (!id) return;
    setNotificaciones(prev => prev.map(n => ({ ...n, is_read: true })));
    const res = await marcarTodasLeidas(id);
    if (!res.success) fetchDataRef.current(true);
  }, []);

  const eliminar = useCallback(async (id: string) => {
    // Optimista: desaparece de inmediato de la vista local.
    setNotificaciones(prev => prev.filter(n => n.id_notificacion !== id));
    const res = await eliminarNotificacion(id);
    if (!res.success) fetchDataRef.current(true); // si falló, se restaura desde BD
  }, []);

  return {
    notificaciones,
    isLoading,
    unreadCount,
    marcarLeida,
    marcarCompletada,
    marcarTodasComoLeidas,
    eliminar,
    refetch: () => fetchData(true),
  };
};
