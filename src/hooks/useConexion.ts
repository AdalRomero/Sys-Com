import { useEffect, useState } from 'react';
import { estaOnline, onConexionChange } from '../lib/conexion';

/**
 * Hook de React sobre la línea de decisión (`conexion.ts`). Re-renderiza
 * al conectar/desconectar de verdad (no solo por el evento del navegador).
 */
export function useConexion(): boolean {
  const [online, setOnline] = useState(estaOnline());
  useEffect(() => onConexionChange(setOnline), []);
  return online;
}
