// Reflejan 1:1 los ENUM de tu base de datos (public.queue_operacion, public.queue_tabla)

export type QueueOperacion = 'insert' | 'update' | 'correccion' | 'delete' | 'aprobar';

export type QueueTabla =
  | 'orden_servicio'
  | 'perfil_info'
  | 'contacto'
  | 'cierre_orden'
  | 'clientes'
  | 'empresa'
  | 'orden_apoyo'
  | 'orden_nota'
  | 'configuracion_empresa';

/** Estado de sincronización LOCAL (no confundir con public.queue_estado, que es del servidor) */
export type EstadoLocal = 'pendiente' | 'sincronizando' | 'error' | 'conflicto';

/**
 * Fila tal como vive en IndexedDB (Dexie), mientras espera subir a
 * public.peticion_queue en Supabase.
 */
export interface PeticionQueueLocal {
  id_peticion: string; // uuid generado en el cliente con crypto.randomUUID()
  operacion: QueueOperacion;
  tabla_destino: QueueTabla;
  id_registro: string | null;
  payload: Record<string, unknown>;
  es_correccion: boolean;
  motivo_cambio: string | null;
  realizado_por: string | null;
  created_local: string; // ISO string - momento en que se generó offline
  intentos_sync: number;
  estado_local: EstadoLocal;
  error_detalle: string | null;
  last_update_conocido?: string | null;
}

/** Lo que tu UI necesita pasar para encolar una operación */
export interface EnqueueParams {
  operacion: QueueOperacion;
  tabla_destino: QueueTabla;
  id_registro?: string | null;
  payload: Record<string, unknown>;
  es_correccion?: boolean;
  motivo_cambio?: string | null;
  realizado_por?: string | null;
  last_update_conocido?: string | null;
}