import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../lib/localdb';
import { syncQueue, retryErrors, isSyncRunning, subscribeToQueueChanges } from '../lib/syncService';
import { useConexion } from './useConexion';

/**
 * Hook listo para pintar un badge/indicador en tu UI:
 * "3 cambios pendientes por sincronizar", spinner mientras sube, etc.
 */
export function useSyncQueue() {
  const isOnline = useConexion();
  const [syncing, setSyncing] = useState(isSyncRunning());

  // useLiveQuery re-renderiza automáticamente cuando cambia IndexedDB
  const items = useLiveQuery(
    () => localDb.peticion_queue.orderBy('created_local').toArray(),
    [],
    []
  );

  useEffect(() => subscribeToQueueChanges(() => setSyncing(isSyncRunning())), []);

  const pendientes = items?.filter((i) => i.estado_local !== 'error') ?? [];
  const errores = items?.filter((i) => i.estado_local === 'error') ?? [];

  const syncNow = useCallback(() => syncQueue(), []);

  return {
    isOnline,
    syncing,
    items: items ?? [],
    pendingCount: pendientes.length,
    errorCount: errores.length,
    syncNow,
    retryErrors,
  };
}
