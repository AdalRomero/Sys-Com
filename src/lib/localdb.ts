import Dexie, { type Table } from 'dexie';
import type {
  Empresa,
  Cliente,
  Orden,
  Usuario,
  AsignacionApoyo,
  OrdenNota,
  Notificacion,
} from '../types';
import type { CierreOrden, SyncMeta, ConfiguracionEmpresa } from '../types/mirror';
import type { OfflineAuthRecord } from '../types';
import type { PeticionQueueLocal } from '../types/queue';

/**
 * Base local en IndexedDB.
 *
 * Cumple dos funciones distintas, que viven en la misma base pero son
 * conceptualmente separadas:
 *
 * 1. ESPEJO DE LECTURA (empresa, clientes, orden_servicio, cierre_orden,
 *    orden_apoyo, orden_nota, perfil_info, notificaciones): copia local de
 *    lo que hay en Supabase, para que la app pueda mostrar información
 *    aunque no haya internet. Se llena/actualiza con mirrorSync.ts.
 *
 * 2. BUZÓN DE ESCRITURA (peticion_queue): operaciones creadas offline que
 *    esperan subir a Supabase. Se maneja con syncService.ts.
 */
class LocalMirrorDatabase extends Dexie {
  // Espejo de lectura
  empresa!: Table<Empresa, string>;
  clientes!: Table<Cliente, string>;
  orden_servicio!: Table<Orden, string>;
  cierre_orden!: Table<CierreOrden, string>;
  orden_apoyo!: Table<AsignacionApoyo, string>;
  orden_nota!: Table<OrdenNota, string>;
  perfil_info!: Table<Usuario, string>;
  notificaciones!: Table<Notificacion, string>;
  auditoria_log!: Table<any, string>;
  configuracion_empresa!: Table<ConfiguracionEmpresa, string>;

  // Metadata de sincronización (para saber qué tan viejo está cada tabla)
  sync_meta!: Table<SyncMeta, string>;

  // Credenciales cacheadas para login offline
  offline_auth!: Table<OfflineAuthRecord, string>;

  // Contadores puramente locales (ej. "local-1", "local-2"... para órdenes
  // creadas offline que todavía no tienen numero_orden real asignado por
  // Supabase). Nunca se sube a Supabase, solo vive en esta máquina.
  contadores_locales!: Table<{ clave: string; valor: number }, string>;

  // Buzón de escritura offline (visto en la entrega anterior)
  peticion_queue!: Table<PeticionQueueLocal, string>;

  constructor() {
    super('syscom_local_db');

    // v1: solo existía la cola de escritura (entrega anterior)
    this.version(1).stores({
      peticion_queue: 'id_peticion, estado_local, created_local, tabla_destino',
    });

    // v2: se agrega el espejo de lectura completo
    this.version(2).stores({
      peticion_queue: 'id_peticion, estado_local, created_local, tabla_destino',

      empresa: 'id_empresa, id_raiz, es_actual',
      clientes: 'id_cliente, id_empresa, id_raiz, es_actual',
      orden_servicio:
        'id_orden_servicio, id_clientes, responsable, realizado_por, estado, numero_orden, created',
      cierre_orden: 'id_cierre, id_orden_servicio',
      orden_apoyo: 'id_apoyo, id_orden_servicio, id_tecnico',
      orden_nota: 'id_nota, id_orden_servicio, tipo, created',
      perfil_info: 'id_perfil_info, auth_usuario, usuario, rol',
      notificaciones: 'id_notificacion, id_usuario, is_read, created',

      sync_meta: 'tabla',
    });

    // v3: contador para los ids de despliegue "local-N" de órdenes creadas offline
    this.version(3).stores({
      contadores_locales: 'clave',
    });

    // v4: Autenticación Offline
    this.version(4).stores({
      offline_auth: 'email, user_id'
    });

    // v5: índices compuestos para acelerar las queries de detalle de orden.
    // En v2, orden_nota y orden_apoyo solo tenían id_orden_servicio como índice simple.
    // Con el índice compuesto [id_orden_servicio+created] el motor de IndexedDB puede
    // resolver la query .where('id_orden_servicio').equals(x) directamente desde el
    // árbol B+ sin escanear filas fuera del rango de esa orden.
    this.version(5).stores({
      orden_nota: 'id_nota, id_orden_servicio, tipo, created, [id_orden_servicio+created]',
      orden_apoyo: 'id_apoyo, id_orden_servicio, id_tecnico, [id_orden_servicio+id_tecnico]',
    });

    // v6: Espejo parcial del historial de auditoría
    this.version(6).stores({
      auditoria_log: 'id_auditoria, tabla, id_registro, created'
    });

    // v7: Configuración de la empresa (Sys-Com) usada en los documentos de orden
    this.version(7).stores({
      configuracion_empresa: 'id_configuracion, es_actual',
    });
  }
}

export const localDb = new LocalMirrorDatabase();

/**
 * Devuelve el siguiente número de una secuencia puramente local (ej.
 * "local-1", "local-2"...). Usa una transacción de Dexie para que dos
 * creaciones offline seguidas nunca se pisen con el mismo número.
 */
export async function siguienteNumeroLocal(clave: string): Promise<number> {
  return localDb.transaction('rw', localDb.contadores_locales, async () => {
    const actual = await localDb.contadores_locales.get(clave);
    const siguiente = (actual?.valor ?? 0) + 1;
    await localDb.contadores_locales.put({ clave, valor: siguiente });
    return siguiente;
  });
}

/**
 * Limpia el ESPEJO DE LECTURA al cerrar sesión, para que el siguiente
 * usuario que se loguee en esta misma máquina no herede datos que no le
 * corresponden (cada usuario puede tener permisos RLS distintos).
 *
 * A propósito NO toca `peticion_queue`: ahí pueden quedar operaciones
 * creadas offline que todavía no subieron a Supabase, y borrarlas sería
 * perder trabajo real del usuario. Si hay pendientes, se suben solos en
 * cuanto vuelva la conexión, sin importar quién esté logueado en ese
 * momento (ver syncService.ts).
 */
export async function limpiarEspejoLocal(): Promise<void> {
  await Promise.all([
    localDb.empresa.clear(),
    localDb.clientes.clear(),
    localDb.orden_servicio.clear(),
    localDb.cierre_orden.clear(),
    localDb.orden_apoyo.clear(),
    localDb.orden_nota.clear(),
    localDb.perfil_info.clear(),
    localDb.notificaciones.clear(),
    localDb.sync_meta.clear(),
    localDb.contadores_locales.clear(),
    localDb.configuracion_empresa.clear(),
  ]);
  invalidarPerfilOfflineCache();
}

let _perfilActualCache: Usuario | null | undefined = undefined;

export function invalidarPerfilOfflineCache() {
  _perfilActualCache = undefined;
}

/**
 * Intenta recuperar el perfil del usuario actual cuando la app está offline.
 * Revisa primero la sesión offline simulada y, si no existe, busca la sesión
 * guardada por Supabase en memoria/caché.
 */
export async function obtenerPerfilOfflineActual(): Promise<Usuario | null> {
  if (_perfilActualCache !== undefined) return _perfilActualCache;

  try {
    const sessionStr = localStorage.getItem('offline_session');
    if (sessionStr) {
      const data = JSON.parse(sessionStr);
      if (data?.perfil) {
        _perfilActualCache = data.perfil;
        return data.perfil;
      }
    }
  } catch (e) {}

  // Si no hay sesión mockeada, quizá se logueó con internet y perdió conexión
  const { supabase } = await import('../utils/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user?.id) {
    const perfiles = await localDb.perfil_info
      .where('auth_usuario').equals(session.user.id)
      .toArray();
    if (perfiles.length > 0) {
      _perfilActualCache = perfiles[0];
      return perfiles[0];
    }
  }

  _perfilActualCache = null;
  return null;
}