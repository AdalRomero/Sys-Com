import { useState, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';

// =============================================================
// useActividad — Historial de actividad de un técnico
// =============================================================
// Consulta 'auditoria_log' filtrando por el id_perfil_info del técnico.
// Solo muestra entradas relevantes para el seguimiento:
//   - Creaciones de orden (INSERT)
//   - Cambios de técnico responsable (UPDATE con 'responsable' en campos_cambios)
// Se excluyen cambios a 'observaciones' y otras ediciones de texto menores.
// =============================================================

// Campos del historial de seguimiento que se consideran relevantes
const CAMPOS_RELEVANTES = ['responsable'];

const esEntradaRelevante = (entry: any): boolean => {
  if (entry.operacion === 'INSERT') return true;
  if (entry.operacion === 'DELETE') return true;
  const campos: string[] = entry.campos_cambios ?? [];
  return campos.some(c => CAMPOS_RELEVANTES.includes(c));
};

export const useActividad = (idPerfilInfo: string) => {
  const [actividad, setActividad] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);

  // Pedimos más registros de los que se muestran para compensar
  // los que se filtran en cliente
  const FETCH_MULTIPLIER = 3;

  const fetchActividad = useCallback(async (limit = 3, reset = false) => {
    if (!idPerfilInfo) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);

    if (reset) {
      pageRef.current = 0;
    }

    const from = pageRef.current * limit * FETCH_MULTIPLIER;
    const to = from + limit * FETCH_MULTIPLIER - 1;

    try {
      const { data, error } = await supabase
        .from('auditoria_log')
        .select('*')
        .eq('realizado_por', idPerfilInfo)
        .eq('tabla', 'orden_servicio')
        .order('created', { ascending: false })
        .range(from, to);

      if (!error && data) {
        const relevantes = data.filter(esEntradaRelevante);
        setActividad((prev) => {
          if (reset) return relevantes;
          // Mismo caso que en useActividadUsuario: si se insertó una fila
          // nueva mientras paginábamos, el offset se corre y una entrada ya
          // mostrada puede repetirse en la siguiente página. Filtramos por
          // id_log para no duplicar keys ni entradas en el timeline.
          const existentes = new Set(prev.map((item) => item.id_log));
          const nuevos = relevantes.filter((item) => !existentes.has(item.id_log));
          return [...prev, ...nuevos];
        });
        // Si vinieron menos registros de los pedidos, no hay más
        setHasMore(data.length === limit * FETCH_MULTIPLIER);
        pageRef.current = reset ? 1 : pageRef.current + 1;
      } else if (error) {
        console.error('Error en Supabase:', error.message);
      }
    } catch (err) {
      console.error('Error al obtener actividad:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [idPerfilInfo]);

  return { actividad, loading, hasMore, fetchActividad };
};