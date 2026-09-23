import { supabase } from '../utils/supabase';
import { localDb } from './localdb';
import { estaOnline, onConexionChange } from './conexion';
import { esDesktop } from './entorno';
import type { EnqueueParams, PeticionQueueLocal } from '../types/queue';

const LOCAL_MAX_INTENTOS = 5;
 
type Listener = () => void;
const listeners = new Set<Listener>();
let syncing = false;
 
function notify() {
  listeners.forEach((cb) => cb());
}
 
/** Permite que hooks/UI se enteren cuando cambia el estado de la cola local */
export function subscribeToQueueChanges(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
 
function buildRegistro(params: EnqueueParams, id_peticion: string): PeticionQueueLocal {
  return {
    id_peticion,
    operacion: params.operacion,
    tabla_destino: params.tabla_destino,
    id_registro: params.id_registro ?? null,
    payload: params.payload,
    es_correccion: params.es_correccion ?? false,
    motivo_cambio: params.motivo_cambio ?? null,
    realizado_por: params.realizado_por ?? null,
    created_local: new Date().toISOString(),
    intentos_sync: 0,
    estado_local: 'pendiente',
    error_detalle: null,
    last_update_conocido: params.last_update_conocido ?? null,
  };
}
 
/**
 * Intenta insertar UNA petición directo en public.peticion_queue de Supabase.
 * Devuelve:
 *  - 'ok'    insertada (o ya lo estaba: 23505 = unique_violation, por un
 *            reintento con el mismo id_peticion)
 *  - 'retry' problema de red/timeout -> reintentable, candidato a caer a local
 *  - 'error' Supabase la rechazó por otra razón (payload inválido, RLS, etc.)
 */
async function insertarPeticion(item: PeticionQueueLocal): Promise<{ status: 'ok' | 'retry' | 'error', errorObj?: any }> {
  const payloadToInsert: any = {
    id_peticion: item.id_peticion,
    operacion: item.operacion,
    tabla_destino: item.tabla_destino,
    id_registro: item.id_registro,
    payload: item.payload,
    es_correccion: item.es_correccion,
    motivo_cambio: item.motivo_cambio,
    last_update_conocido: item.last_update_conocido,
  };

  if (item.realizado_por) {
    payloadToInsert.realizado_por = item.realizado_por;
  }

  const { error } = await supabase.from('peticion_queue').insert(payloadToInsert);
 
  if (!error) return { status: 'ok' };
  if (error.code === '23505') return { status: 'ok' };
 
  console.error('Supabase insert error details:', error);

  const pareceErrorDeRed =
    error.code === undefined ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('network');
 
  return { status: pareceErrorDeRed ? 'retry' : 'error', errorObj: error };
}
 
/**
 * Punto de entrada único para crear/editar/cerrar órdenes, etc.
 *
 * Filosofía "en línea manda":
 *  1. Si hay internet, se intenta DIRECTO contra Supabase. Si funciona,
 *     no se toca la base local para nada — cero trabajo extra.
 *  2. Solo si no hay internet, o la petición se cae a media conexión
 *     (se veía online pero la request no llegó), se guarda en la cola
 *     local como plan B. Esa cola se sube sola en cuanto vuelve la señal
 *     (ver syncQueue / initSyncService más abajo).
 *
 * El nombre y la firma son compatibles con la versión anterior: puedes
 * seguir llamando `await enqueueOperacion({...})` igual que antes.
 */
export async function enqueueOperacion(
  params: EnqueueParams
): Promise<{ id_peticion: string; guardadoLocal: boolean }> {
  if (!params.last_update_conocido && params.id_registro && ['update', 'correccion', 'delete'].includes(params.operacion)) {
    try {
      const table = (localDb as any)[params.tabla_destino];
      if (table) {
        const record = await table.get(params.id_registro);
        if (record && record.last_update) {
          params.last_update_conocido = record.last_update;
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener last_update local para la operacion:', e);
    }
  }

  const id_peticion = crypto.randomUUID();
  const registro = buildRegistro(params, id_peticion);
 
  if (!esDesktop()) {
    // En la web (Vercel) siempre necesitas internet para usar la app, así
    // que no existe el concepto de "plan B local": o se sube, o se avisa.
    const resultado = await insertarPeticion(registro);

    if (resultado.status === 'ok') {
      return { id_peticion, guardadoLocal: false };
    }

    throw new Error(
      resultado.status === 'error'
        ? `Rechazado por el servidor. Razón: ${resultado.errorObj?.message || 'RLS / Permisos'} (Código: ${resultado.errorObj?.code || 'Desconocido'})`
        : 'No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.'
    );
  }

  if (estaOnline()) {
    const resultado = await insertarPeticion(registro);
 
    if (resultado.status === 'ok') {
      return { id_peticion, guardadoLocal: false };
    }
 
    if (resultado.status === 'error') {
      // Rechazo real del servidor (no de conectividad): no tiene caso
      // guardarlo en local para reintentar lo mismo más tarde.
      throw new Error(
        `Rechazado por el servidor. Razón: ${resultado.errorObj?.message || 'RLS / Permisos'} (Código: ${resultado.errorObj?.code || 'Desconocido'})`
      );
    }
 
    // resultado.status === 'retry': se veía en línea pero la petición no llegó
    // (el internet se cayó a media conexión). Cae al plan B.
  }
 
  await localDb.peticion_queue.add(registro);
  notify();
 
  return { id_peticion, guardadoLocal: true };
}
 
/**
 * Recorre lo que haya quedado en la cola local (por haberse creado offline)
 * y lo sube a Supabase en orden cronológico. Cada registro confirmado se
 * borra de inmediato de local.
 */
export async function syncQueue(): Promise<void> {
  if (!esDesktop() || syncing || !estaOnline()) return;
  syncing = true;
  notify();
 
  try {
    const pendientes = await localDb.peticion_queue
      .where('estado_local')
      .anyOf(['pendiente', 'error'])
      .sortBy('created_local');
 
    for (const item of pendientes) {
      if (!estaOnline()) break;
 
      await localDb.peticion_queue.update(item.id_peticion, { estado_local: 'sincronizando' });
 
      const resultado = await insertarPeticion(item);
 
      if (resultado.status === 'ok') {
        await localDb.peticion_queue.delete(item.id_peticion);
      } else if (resultado.status === 'retry') {
        const intentos = item.intentos_sync + 1;
        await localDb.peticion_queue.update(item.id_peticion, {
          estado_local: intentos >= LOCAL_MAX_INTENTOS ? 'error' : 'pendiente',
          intentos_sync: intentos,
          error_detalle: 'Fallo de red al sincronizar. Se reintentará automáticamente.',
        });
      } else {
        await localDb.peticion_queue.update(item.id_peticion, {
          estado_local: 'error',
          intentos_sync: item.intentos_sync + 1,
          error_detalle: 'Supabase rechazó la operación (revisa el payload o los permisos RLS).',
        });
      }
 
      notify();
    }
  } finally {
    syncing = false;
    notify();
  }
}
 
export function isSyncRunning() {
  return syncing;
}
 
export async function getPendingCount(): Promise<number> {
  return localDb.peticion_queue.where('estado_local').anyOf(['pendiente', 'sincronizando']).count();
}
 
export async function getErrorCount(): Promise<number> {
  return localDb.peticion_queue.where('estado_local').equals('error').count();
}
 
export async function retryErrors(): Promise<void> {
  const errores = await localDb.peticion_queue.where('estado_local').equals('error').toArray();
  await Promise.all(
    errores.map((item) => localDb.peticion_queue.update(item.id_peticion, { estado_local: 'pendiente' }))
  );
  notify();
  if (estaOnline()) void syncQueue();
}
 async function recuperarItemsHuerfanos(): Promise<void> {
  const huerfanos = await localDb.peticion_queue
    .where('estado_local')
    .equals('sincronizando')
    .toArray();

  if (huerfanos.length === 0) return;

  console.warn(`[syncService] ${huerfanos.length} petición(es) quedaron en 'sincronizando' de una sesión anterior, se reintentan.`);

  await Promise.all(
    huerfanos.map((item) =>
      localDb.peticion_queue.update(item.id_peticion, { estado_local: 'pendiente' })
    )
  );
  notify();
}
/**
 * Llamar UNA vez al arrancar la app (junto con initMirrorSync()).
 * En condiciones normales la cola local casi siempre está vacía (porque
 * "en línea manda"); esto solo entra en acción si hubo algo pendiente de
 * cuando la app estuvo offline.
 */
export function initSyncService(): () => void {
  if (!esDesktop()) {
    return () => {};
  }

  // NUEVO: sanar la cola antes de cualquier otra cosa
  void recuperarItemsHuerfanos().then(() => {
    if (estaOnline()) void syncQueue();
  });

  const cancelarSuscripcion = onConexionChange((online) => {
    if (online) void syncQueue();
  });

  const interval = setInterval(() => {
    if (estaOnline()) void syncQueue();
  }, 30_000);

  return () => {
    cancelarSuscripcion();
    clearInterval(interval);
  };
}

 