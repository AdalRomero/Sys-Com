import { useEffect, useRef, useState } from 'react';
import { getOrdenes } from '../service/ordenes.service';
import type { Orden } from '../types';

export const useOrdenes = (
  setData: React.Dispatch<React.SetStateAction<Orden[]>>,
  setTotal: React.Dispatch<React.SetStateAction<number>>,
  page: number,
  filtros: { estado?: string; responsable?: string; prioridad?: string; busqueda?: string; fecha?: string }
) => {
  const [isLoading, setIsLoading] = useState(true);

  // Ref para siempre tener acceso a los valores más recientes sin re-registrar el listener
  const fetchParamsRef = useRef({ page, filtros });
  useEffect(() => {
    fetchParamsRef.current = { page, filtros };
  });

  const fetchData = async (silencioso = false) => {
    const { page: p, filtros: f } = fetchParamsRef.current;
    if (!silencioso) setIsLoading(true);
    try {
      const res = await getOrdenes(p, 5, f);
      setData(res.data);
      setTotal(res.count);
    } catch (err) {
      console.error('Error cargando ordenes:', err);
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  };

  // Ref para que el listener siempre llame a la versión más reciente de fetchData
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; });

  // Fetch inicial y cuando cambian filtros/página
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filtros.estado, filtros.responsable, filtros.prioridad, filtros.busqueda, filtros.fecha]);

  // Listener de evento realtime — se registra UNA sola vez
  useEffect(() => {
    const handler = () => fetchDataRef.current(true);
    window.addEventListener('refetch-ordenes', handler);
    return () => window.removeEventListener('refetch-ordenes', handler);
  }, []);

  return { isLoading, refetch: () => fetchData(true) };
};