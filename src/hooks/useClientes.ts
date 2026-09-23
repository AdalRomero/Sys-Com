import { useEffect, useRef, useState } from 'react';
import { getClientesPaginados } from '../service/clientes.service';

export const useClientes = (
  setData: React.Dispatch<React.SetStateAction<any[]>>,
  setTotal: React.Dispatch<React.SetStateAction<number>>,
  page: number,
  busqueda: string
) => {
  const [isLoading, setIsLoading] = useState(true);

  // Ref para siempre tener acceso a los valores más recientes sin re-registrar el listener
  const fetchParamsRef = useRef({ page, busqueda });
  useEffect(() => {
    fetchParamsRef.current = { page, busqueda };
  });

  const fetchData = async (silencioso = false) => {
    const { page: p, busqueda: b } = fetchParamsRef.current;
    if (!silencioso) setIsLoading(true);
    try {
      const res = await getClientesPaginados(p, 5, b);
      setData(res.data || []);
      setTotal(res.count || 0);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  };

  // Ref para que el listener siempre llame a la versión más reciente de fetchData
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; });

  // Fetch inicial y cuando cambian página/búsqueda
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, busqueda]);

  // Listener de evento realtime — se registra UNA sola vez
  useEffect(() => {
    const handler = () => fetchDataRef.current(true);
    window.addEventListener('refetch-clientes', handler);
    return () => window.removeEventListener('refetch-clientes', handler);
  }, []);

  return { isLoading };
};