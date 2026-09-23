import { useState, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { OrdenNota } from '../types';
import { estaOnline } from '../lib/conexion';
import { esDesktop } from '../lib/entorno';
import { getNotasOrden } from '../service/ordenes.service';

export const useNotas = (idOrden: string | undefined) => {
  const [notas, setNotas] = useState<OrdenNota[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);

  const LIMIT = 5;

  const fetchNotas = useCallback(async (reset = false) => {
    if (!idOrden) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);

    if (reset) {
      pageRef.current = 0;
    }

    const from = pageRef.current * LIMIT;
    const to = from + LIMIT - 1;

    try {
      if (!estaOnline() && esDesktop()) {
        const todos = await getNotasOrden(idOrden);
        const data = todos.slice(from, to + 1);
        setNotas((prev) => (reset ? data : [...prev, ...data]) as OrdenNota[]);
        setHasMore(data.length === LIMIT);
        pageRef.current = reset ? 1 : pageRef.current + 1;
        return;
      }

      const { data, error } = await supabase
        .from('orden_nota')
        .select(`
          *,
          realizado_por_perfil:perfil_info!realizado_por(id_perfil_info, nombres, apellido_paterno, apellido_materno),
          responsable_antes_perfil:perfil_info!responsable_antes(id_perfil_info, nombres, apellido_paterno, apellido_materno),
          responsable_despues_perfil:perfil_info!responsable_despues(id_perfil_info, nombres, apellido_paterno, apellido_materno)
        `)
        .eq('id_orden_servicio', idOrden)
        .order('created', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setNotas((prev) => (reset ? data : [...prev, ...data]) as OrdenNota[]);
        setHasMore(data.length === LIMIT);
        pageRef.current = reset ? 1 : pageRef.current + 1;
      } else if (error) {
        console.error('Error fetching notas:', error);
      }
    } catch (err) {
      console.error('Error fetching notas:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [idOrden]);

  return { notas, setNotas, loadingNotas: loading, hasMoreNotas: hasMore, fetchNotas };
};
