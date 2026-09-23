import { useParams, useLocation } from 'react-router-dom';

export function useSecureParams<T extends Record<string, string | undefined>>() {
  const params = useParams<T>();
  const location = useLocation();

  // Intentamos obtener el ID real oculto desde el historial (state)
  const stateData = location.state as { secureId?: string } | null;

  // Creamos un nuevo objeto de parámetros limpio
  const secureParams = { ...params } as T;

  // Recorremos los parámetros de la URL (id, id_orden, etc.)
  for (const key in secureParams) {
    const value = secureParams[key];
    
    // Si el valor actual de la URL es una palabra estática de enmascaramiento 
    // (como 'perfil', 'detalle', 'ver'), lo sustituimos por el UUID real del state
    if (value === 'perfil' || value === 'detalle' || value === 'ver') {
      if (stateData?.secureId) {
        secureParams[key] = stateData.secureId as any;
      }
    }
  }

  return secureParams;
}