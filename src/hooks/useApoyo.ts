import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import type { AsignacionOrden } from '../types';
import { estaOnline } from '../lib/conexion';
import { esDesktop } from '../lib/entorno';
import { getApoyosOrden } from '../service/ordenes.service';

export const useApoyo = (idOrden: string | undefined) => {
  const [apoyos, setApoyos] = useState<AsignacionOrden[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);

  const LIMIT = 5;

  const fetchApoyos = useCallback(async (reset = false) => {
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
        const todos = await getApoyosOrden(idOrden);
        const data = todos.slice(from, to + 1);
        setApoyos((prev) => (reset ? data : [...prev, ...data]) as AsignacionOrden[]);
        setHasMore(data.length === LIMIT);
        pageRef.current = reset ? 1 : pageRef.current + 1;
        return;
      }

      const { data, error } = await supabase
        .from('orden_apoyo')
        .select(`
          *,
          tecnico_perfil:perfil_info!id_tecnico(id_perfil_info, nombres, apellido_paterno, apellido_materno),
          realizado_por_perfil:perfil_info!realizado_por(id_perfil_info, nombres, apellido_paterno, apellido_materno)
        `)
        .eq('id_orden_servicio', idOrden)
        .order('created', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setApoyos((prev) => (reset ? data : [...prev, ...data]) as AsignacionOrden[]);
        setHasMore(data.length === LIMIT);
        pageRef.current = reset ? 1 : pageRef.current + 1;
      } else if (error) {
        console.error('Error fetching apoyos:', error);
      }
    } catch (err) {
      console.error('Error fetching apoyos:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [idOrden]);

  // Ref para que el listener de realtime siempre llame a la versión
  // más reciente de fetchApoyos (con el idOrden correcto en el closure)
  const fetchApoyosRef = useRef(fetchApoyos);
  useEffect(() => {
    fetchApoyosRef.current = fetchApoyos;
  }, [fetchApoyos]);

  // Ref con el idOrden actual, para comparar dentro del listener sin
  // tener que re-registrar el addEventListener en cada cambio.
  const idOrdenRef = useRef(idOrden);
  useEffect(() => {
    idOrdenRef.current = idOrden;
  }, [idOrden]);

  // Realtime FILTRADO: solo refetch si el cambio pertenece a ESTA orden.
  // Se escucha 'data-changed' directo (en vez de useRealtimeOrdenes) para
  // poder leer el id_orden_servicio del payload y descartar todo lo que
  // no sea de idOrden, evitando refetches de órdenes que no están abiertas.
  useEffect(() => {
    const listener = (e: Event) => {
      const actual = idOrdenRef.current;
      if (!actual) return;

      const { tabla, event, new: nuevo, old } = (e as CustomEvent).detail;

      if (!['orden_apoyo', 'orden_nota', 'orden_servicio'].includes(tabla)) return;
      if (!['INSERT', 'UPDATE', 'DELETE'].includes(event)) return;

      // orden_apoyo / orden_nota tienen id_orden_servicio como FK propia.
      // orden_servicio es la orden misma, así que se compara su propio id.
      const idRelacionado =
        tabla === 'orden_servicio'
          ? (nuevo?.id_orden_servicio ?? old?.id_orden_servicio)
          : (nuevo?.id_orden_servicio ?? old?.id_orden_servicio);

      if (idRelacionado !== actual) return;

      fetchApoyosRef.current(true);
    };

    window.addEventListener('data-changed', listener);
    return () => window.removeEventListener('data-changed', listener);
  }, []);

  return { apoyos, setApoyos, loadingApoyos: loading, hasMoreApoyos: hasMore, fetchApoyos };
};