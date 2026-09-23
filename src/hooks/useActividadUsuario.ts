import { useState, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';

// =============================================================
// useActividadUsuario — Historial GLOBAL de un usuario
// =============================================================
// Responde a "¿qué ha hecho este usuario en el sistema?": lee
// 'auditoria_log' filtrando por 'realizado_por' (el autor de la acción),
// SIN restringir la tabla. Así se ve en un solo lugar si modificó un
// perfil, un cliente, una empresa, una orden, si agregó algo o si
// eliminó algo — todo lo que haya tocado, ordenado por fecha.
// =============================================================

export const useActividadUsuario = (idPerfilInfo: string) => {
  const [actividad, setActividad] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);

  const fetchActividad = useCallback(async (limit = 8, reset = false) => {
    if (!idPerfilInfo) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);

    if (reset) {
      pageRef.current = 0;
    }

    const from = pageRef.current * limit;
    const to = from + limit - 1;

    try {
      const { data, error } = await supabase
        .from('auditoria_log')
        .select('*')
        .eq('realizado_por', idPerfilInfo)
        .order('created', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setActividad((prev) => {
          if (reset) return data;
          // Si mientras paginábamos se insertó una nueva fila de auditoría,
          // la ventana de offset se recorre y un registro ya mostrado puede
          // volver a aparecer en la siguiente página. Filtramos por id_log
          // para no duplicar keys ni entradas en el timeline.
          const existentes = new Set(prev.map((item) => item.id_log));
          const nuevos = data.filter((item) => !existentes.has(item.id_log));
          return [...prev, ...nuevos];
        });
        // Si vinieron menos registros de los pedidos, no hay más páginas
        setHasMore(data.length === limit);
        pageRef.current = reset ? 1 : pageRef.current + 1;
      } else if (error) {
        console.error('Error en Supabase:', error.message);
      }
    } catch (err) {
      console.error('Error al obtener actividad del usuario:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [idPerfilInfo]);

  return { actividad, loading, hasMore, fetchActividad };
};