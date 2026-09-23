import { useEffect, useRef } from 'react';

export function useRealtimeOrdenes(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const listener = (e: Event) => {
      const { tabla, event } = (e as CustomEvent).detail;
      if (
        ['orden_servicio', 'orden_apoyo', 'orden_nota'].includes(tabla) && 
        ['INSERT', 'UPDATE', 'DELETE'].includes(event)
      ) {
        onChangeRef.current();
      }
    };
    window.addEventListener('data-changed', listener);
    return () => window.removeEventListener('data-changed', listener);
  }, []); // sin dependencia en onChange — el ref siempre tiene la versión más reciente
}