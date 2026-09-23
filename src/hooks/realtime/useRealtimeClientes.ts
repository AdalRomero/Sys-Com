import { useEffect } from 'react';

export function useRealtimeClientes(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const listener = (e: Event) => {
      const { tabla, event, new: nuevo } = (e as CustomEvent).detail;

      if (tabla === 'clientes' && ['INSERT', 'UPDATE', 'DELETE'].includes(event)) {
        window.dispatchEvent(new CustomEvent('refetch-clientes'));
      }

      if (tabla === 'peticion_queue' && event === 'UPDATE') {
        const { estado, tabla_destino } = nuevo;
        if (estado === 'completado' && tabla_destino === 'clientes') {
          window.dispatchEvent(new CustomEvent('refetch-clientes'));
        }
      }
    };

    window.addEventListener('data-changed', listener);
    return () => window.removeEventListener('data-changed', listener);
  }, [enabled]);
}