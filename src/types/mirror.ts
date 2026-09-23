// Tipos que tu BD tiene (public.cierre_orden) pero que no están en tu
// index.ts compartido todavía. Los agrego aquí para no tocar tu archivo;
// si quieres, después los mueves a src/types/index.ts para tenerlos junto
// a los demás.

export interface CierreOrden {
  id_cierre: string;
  id_orden_servicio: string;
  cerrado_por?: string | null;
  finalized_at: string;
  observaciones_finales?: string | null;
}

/**
 * public.configuracion_empresa — datos de la empresa (Sys-Com) usados en
 * los documentos de orden. Solo existe un registro con es_actual = true
 * a la vez (ver configuracion_empresa.sql).
 */
export interface ConfiguracionEmpresa {
  id_configuracion: string;
  nombre: string;
  slogan?: string | null;
  responsable_nombre?: string | null;
  email?: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  telefono?: string | null;
  fax?: string | null;
  rfc?: string | null;
  es_actual: boolean;
  motivo_cambio?: string | null;
  editado_por?: string | null;
  created: string;
  last_update: string;
}

/** Registro interno para saber cuándo se sincronizó por última vez cada tabla */
export interface SyncMeta {
  tabla: string; // clave primaria, ej. 'clientes'
  last_sync: string; // ISO string
}
