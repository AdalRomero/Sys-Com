import { supabase } from '../utils/supabase';
import { localDb } from '../lib/localdb';
import { invalidarCacheOrdenesLocal } from './localSelectors';
import { estaOnline, onConexionChange } from './conexion';
import { esDesktop } from './entorno';
import type {
  AsignacionApoyo,
  OrdenNota,
} from '../types';

const PAGE_SIZE = 1000; // límite por defecto de PostgREST

type TablaEspejo =
  | 'empresa'
  | 'clientes'
  | 'orden_servicio'
  | 'cierre_orden'
  | 'orden_apoyo'
  | 'orden_nota'
  | 'perfil_info'
  | 'notificaciones'
  | 'auditoria_log'
  | 'configuracion_empresa';

const PK_POR_TABLA: Record<TablaEspejo, string> = {
  empresa: 'id_empresa',
  clientes: 'id_cliente',
  orden_servicio: 'id_orden_servicio',
  cierre_orden: 'id_cierre',
  orden_apoyo: 'id_apoyo',
  orden_nota: 'id_nota',
  perfil_info: 'id_perfil_info',
  notificaciones: 'id_notificacion',
  auditoria_log: 'id_auditoria',
  configuracion_empresa: 'id_configuracion',
};

const TABLAS_ESPEJO = Object.keys(PK_POR_TABLA) as TablaEspejo[];

/** 
 * Trae TODAS las filas de una tabla, paginando (Supabase limita a 1000 por request), 
 * y las guarda directamente en Dexie en pedazos (procedural) para no bloquear la app ni saturar RAM.
 */
async function pullTableProcedural(tableName: string, dexieTable: any, select = '*'): Promise<void> {
  let desde = 0;

  while (true) {
    const hasta = desde + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(tableName).select(select).range(desde, hasta);

    if (error) throw new Error(`Error al traer ${tableName}: ${error.message}`);
    if (!data || data.length === 0) break;

    await dexieTable.bulkPut(data);

    if (data.length < PAGE_SIZE) break;
    desde += PAGE_SIZE;

    // Pausa breve para liberar el Event Loop y que la UI no se trabe
    await new Promise(r => setTimeout(r, 100));
  }
}

async function marcarSincronizado(tabla: string) {
  await localDb.sync_meta.put({ tabla, last_sync: new Date().toISOString() });
}

export async function getUltimaSincronizacion(tabla: string): Promise<string | null> {
  const meta = await localDb.sync_meta.get(tabla);
  return meta?.last_sync ?? null;
}

// ── Descarga completa por tabla (fotografía inicial / recuperación) ──────

export async function pullEmpresas(): Promise<void> {
  await pullTableProcedural('empresa', localDb.empresa);
  await marcarSincronizado('empresa');
}

export async function pullClientes(): Promise<void> {
  await pullTableProcedural('clientes', localDb.clientes);
  await marcarSincronizado('clientes');
}

export async function pullOrdenes(): Promise<void> {
  await pullTableProcedural('orden_servicio', localDb.orden_servicio);
  await marcarSincronizado('orden_servicio');
}

export async function pullCierres(): Promise<void> {
  await pullTableProcedural('cierre_orden', localDb.cierre_orden);
  await marcarSincronizado('cierre_orden');
}

export async function pullApoyos(): Promise<void> {
  await pullTableProcedural('orden_apoyo', localDb.orden_apoyo);
  await marcarSincronizado('orden_apoyo');
}

export async function pullNotas(): Promise<void> {
  await pullTableProcedural('orden_nota', localDb.orden_nota);
  await marcarSincronizado('orden_nota');
}

export async function pullPerfiles(): Promise<void> {
  await pullTableProcedural('perfil_info', localDb.perfil_info, '*, contacto(*)');
  await marcarSincronizado('perfil_info');
}

export async function pullAuditoria(): Promise<void> {
  // Bajamos hasta 5000 registros, en pedazos de 500 para no bloquear el hilo (procedural)
  const LIMIT_TOTAL = 5000;
  const CHUNK_SIZE = 500;
  let descargados = 0;

  while (descargados < LIMIT_TOTAL) {
    const { data, error } = await supabase
      .from('auditoria_log')
      .select('*')
      .order('created', { ascending: false })
      .range(descargados, descargados + CHUNK_SIZE - 1);

    if (error) {
      console.warn(`Error al traer auditoria_log: ${error.message}`);
      break;
    }
    
    if (!data || data.length === 0) break;

    await localDb.auditoria_log.bulkPut(data);
    descargados += data.length;

    if (data.length < CHUNK_SIZE) break;

    // Pausita para no saturar el event loop ni el ancho de banda de golpe
    await new Promise(r => setTimeout(r, 300));
  }

  await marcarSincronizado('auditoria_log');
}

export async function pullNotificaciones(): Promise<void> {
  await pullTableProcedural('notificaciones', localDb.notificaciones);
  await marcarSincronizado('notificaciones');
}

export async function pullConfiguracionEmpresa(): Promise<void> {
  await pullTableProcedural('configuracion_empresa', localDb.configuracion_empresa);
  await marcarSincronizado('configuracion_empresa');
}

/**
 * Descarga TODO el espejo de lectura. Se usa:
 *  - al arrancar la app (foto inicial), y
 *  - justo al recuperar la conexión (para no perder nada de lo que haya
 *    cambiado mientras estuvo offline).
 * Usa bulkPut (no clear + put), así que es segura de correr aunque
 * mientras tanto ya hayan llegado eventos de 'data-changed'.
 */
export async function hydrateAll(): Promise<void> {
  if (!esDesktop() || !estaOnline()) return;

  const tareas = [
    pullEmpresas(),
    pullClientes(),
    pullOrdenes(),
    pullCierres(),
    pullApoyos(),
    pullNotas(),
    pullPerfiles(),
    pullNotificaciones(),
    pullConfiguracionEmpresa(),
  ];

  const resultados = await Promise.allSettled(tareas);
  resultados.forEach((r) => {
    if (r.status === 'rejected') console.warn('[mirrorSync]', r.reason);
  });

  // Lanzamos la auditoria de forma completamente independiente y procedural
  // para que el grueso de la app ya esté sincronizada y usable sin esperarlo.
  pullAuditoria().catch(e => console.warn('[mirrorSync] auditoria:', e));
}

// ── Sincronización CONTINUA, reusando tu bus de eventos existente ─────
//
// No abrimos canales de Supabase nuevos. En algún lugar de tu app ya
// existe el listener central que suscribe los canales de Realtime y hace:
//
//   window.dispatchEvent(new CustomEvent('data-changed', {
//     detail: { tabla, event, new: nuevo, old: viejo }
//   }))
//
// (el mismo evento que ya consumen useRealtimeClientes, useRealtimeEmpresas,
// useRealtimeUsuarios, etc.) Aquí solo nos enganchamos a ese evento para
// mantener IndexedDB al día, igual que esos hooks mantienen el estado de
// React al día.

/**
 * NUEVO: orden_apoyo y orden_nota se crean vía peticion_queue (el trigger
 * fn_procesar_peticion hace el INSERT real). RealtimeProvider tiene un
 * "puente" que, al completarse esa petición, reemite un data-changed con
 * tabla:'orden_apoyo'/'orden_nota' — pero esa fila sintética SOLO trae los
 * campos que venían en el jsonb original (id_orden_servicio, id_tecnico,
 * etc.), NO trae la primary key real (id_apoyo / id_nota) porque el
 * trigger la genera server-side y el puente no tiene forma de saberla.
 *
 * Si dejáramos que aplicarCambioEnDexie haga `dexieTable.put(nuevo)` con
 * esa fila incompleta, el put fallaría (sin PK) o escribiría un registro
 * corrupto en IndexedDB. Por eso, cuando detectamos que la fila no trae
 * su PK, la descartamos y en su lugar pedimos a Supabase las filas reales
 * de esa orden — así el espejo local siempre queda con datos completos y
 * correctos, sin importar qué tan completo venga el evento del puente.
 *
 * (orden_apoyo y orden_nota SÍ están en la publicación de Realtime, así
 * que en el caso normal ya llega un evento nativo con la fila completa
 * antes o después de este — este código solo protege contra el evento
 * sintético incompleto del puente, que sería redundante pero inofensivo
 * una vez con esta guarda.)
 */
async function refrescarApoyosDeOrden(idOrden: string) {
  const { data, error } = await supabase
    .from('orden_apoyo')
    .select('*')
    .eq('id_orden_servicio', idOrden);
  if (!error && data) {
    await localDb.orden_apoyo.bulkPut(data as AsignacionApoyo[]);
  }
}

async function refrescarNotasDeOrden(idOrden: string) {
  const { data, error } = await supabase
    .from('orden_nota')
    .select('*')
    .eq('id_orden_servicio', idOrden);
  if (!error && data) {
    await localDb.orden_nota.bulkPut(data as OrdenNota[]);
  }
}

function aplicarCambioEnDexie(tabla: TablaEspejo, eventType: string, nuevo: any, viejo: any) {
  const dexieTable = (localDb as unknown as Record<string, { put: Function; delete: Function }>)[
    tabla
  ];
  const pk = PK_POR_TABLA[tabla];

  if (eventType === 'DELETE') {
    const idBorrado = viejo?.[pk];
    if (idBorrado) void dexieTable.delete(idBorrado);
    if (tabla === 'orden_servicio' || tabla === 'clientes' || tabla === 'perfil_info') {
      invalidarCacheOrdenesLocal();
    }
    return;
  }

  // NUEVO: guarda contra filas sintéticas del puente sin PK real —
  // ver comentario arriba de refrescarApoyosDeOrden/refrescarNotasDeOrden.
  if ((tabla === 'orden_apoyo' || tabla === 'orden_nota') && !nuevo?.[pk]) {
    const idOrden = nuevo?.id_orden_servicio;
    if (!idOrden) return; // sin id_orden_servicio tampoco hay nada que hacer
    if (tabla === 'orden_apoyo') void refrescarApoyosDeOrden(idOrden);
    else void refrescarNotasDeOrden(idOrden);
    return;
  }

  // Igual que en useRealtimeUsuarios: perfil_info llega sin el join de
  // contacto, así que se preserva el contacto que ya teníamos en local.
  if (tabla === 'perfil_info') {
    void localDb.perfil_info.get(nuevo.id_perfil_info).then((existente) => {
      void localDb.perfil_info.put({ ...existente, ...nuevo, contacto: existente?.contacto });
    });
    invalidarCacheOrdenesLocal();
    return;
  }

  void dexieTable.put(nuevo);

  // Invalida el caché de ordenes si cambió algo que afecta el join
  if (tabla === 'orden_servicio' || tabla === 'clientes') {
    invalidarCacheOrdenesLocal();
  }
}

// `contacto` no tiene tabla local propia (vive anidado en perfil_info.contacto)
function aplicarCambioContacto(eventType: string, nuevo: any, viejo: any) {
  const idPerfil = (nuevo ?? viejo)?.id_perfil_info;
  if (!idPerfil) return;

  void localDb.perfil_info.get(idPerfil).then((perfil) => {
    if (!perfil) return; // el perfil aún no llegó al espejo, no hay nada que actualizar
    void localDb.perfil_info.put({
      ...perfil,
      contacto:
        eventType === 'DELETE'
          ? undefined
          : {
              lada: nuevo.lada,
              telefono: nuevo.telefono,
              direccion: nuevo.direccion,
              correo_personal: nuevo.correo_personal,
            },
    });
  });
}

function handlerDataChanged(e: Event) {
  const { tabla, event, new: nuevo, old } = (e as CustomEvent).detail ?? {};
  if (!tabla || !event) return;

  if (tabla === 'contacto') {
    aplicarCambioContacto(event, nuevo, old);
    return;
  }

  if ((TABLAS_ESPEJO as string[]).includes(tabla)) {
    aplicarCambioEnDexie(tabla as TablaEspejo, event, nuevo, old);
  }

  // peticion_queue no se espejea como tabla de lectura, pero si tu
  // dispatcher central también emite sus cambios, aprovechamos para
  // limpiar del buzón local cualquier ítem que el servidor ya completó
  // (por si se subió desde otro dispositivo/pestaña).
  if (tabla === 'peticion_queue' && event === 'UPDATE' && nuevo?.estado === 'completado') {
    void localDb.peticion_queue.delete(nuevo.id_peticion);
  }
}

/** Engancha el espejo local a tu bus de eventos 'data-changed' existente. */
export function attachMirrorToDataChanged(): () => void {
  window.addEventListener('data-changed', handlerDataChanged);
  return () => window.removeEventListener('data-changed', handlerDataChanged);
}

/**
 * Llamar UNA vez al arrancar la app (junto con initSyncService()):
 *  1. Foto inicial completa (hydrateAll).
 *  2. Se engancha a 'data-changed' -> de ahí en adelante el local se
 *     mantiene al día solo, reusando tu Realtime existente.
 *  3. Si se pierde y recupera la conexión (línea de decisión, conexion.ts),
 *     repite la foto completa por si algún evento se perdió mientras
 *     estuvo desconectado.
 */
export function initMirrorSync(): () => void {
  if (!esDesktop()) {
    // En la web no existe el espejo de lectura local: la app siempre lee
    // directo de Supabase, así que no hay nada que enganchar aquí.
    return () => {};
  }

  void hydrateAll();
  const desconectarListener = attachMirrorToDataChanged();

  const cancelarSuscripcion = onConexionChange((online) => {
    if (online) void hydrateAll();
  });

  return () => {
    desconectarListener();
    cancelarSuscripcion();
  };
}