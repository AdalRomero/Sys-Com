import { supabase } from '../utils/supabase';
import { enqueueOperacion } from '../lib/syncService';
import { estaOnline } from '../lib/conexion';
import { esDesktop } from '../lib/entorno';
import { localDb, siguienteNumeroLocal, obtenerPerfilOfflineActual } from '../lib/localdb';
import { getOrdenesLocal, getOrdenDetalleLocal } from '../lib/localSelectors';
import { crearEmpresaInline } from './clientes.service';
import type { Orden, Cliente } from '../types';

// =============================================================
// NOTA IMPORTANTE
// =============================================================
// Cambios respecto a la versión anterior:
//  - orden_servicio.id_cliente_frecuente / id_cliente_ocasional ->
//    ahora es un solo campo: orden_servicio.id_clientes (FK a clientes.id_cliente).
//  - Las RPCs 'buscar_ordenes' y 'buscar_ordenes_finalizadas' ya NO EXISTEN.
//    Las sustituyo por queries directas a 'orden_servicio' con paginación
//    manual (count: 'exact' + range) y búsqueda vía el propio search_vector
//    de la tabla (textSearch), que es justo para lo que se generó esa columna.
//  - La vista 'v_historial_ordenes' ya NO EXISTE. getHistorialOrden ahora
//    lee directo de 'auditoria_log' filtrando tabla='orden_servicio'.
//    Esto es un sustituto temporal: te da el log crudo (datos_antes/despues,
//    campos_cambios, quién y cuándo), pero no viene ya formateado como
//    HistorialEntry. Cuando definas la función/vista definitiva, se ajusta.
//  - Se quitó el manejo de 'aprobada' / 'aprobada_por' / 'aprobada_at'
//    porque no existen en orden_servicio del esquema actual.
// =============================================================

const SELECT_ORDEN_COMPLETA = `
  *,
  cliente:clientes!orden_servicio_id_clientes_fkey (
    id_cliente, nombre, direccion, correo, lada, telefono, id_empresa,
    empresa (id_empresa, nombre, direccion, correo, lada, telefono)
  ),
  cierre_orden (
    observaciones_finales
  ),
  responsable_perfil:perfil_info!orden_servicio_responsable_fkey (
    id_perfil_info, nombres, apellido_paterno, apellido_materno, usuario
  ),
  realizado_por_perfil:perfil_info!orden_servicio_created_by_fkey (
    id_perfil_info, nombres, apellido_paterno, apellido_materno, usuario
  )
`;
const aplicarFiltroFecha = (query: any, fecha?: string, campoFecha: string = 'created') => {
  if (!fecha) return query;

  let year, month, day;
  const matchDMY = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  
  if (matchDMY) {
    day = matchDMY[1];
    month = matchDMY[2];
    year = matchDMY[3];
  } else {
    const matchYMD = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (matchYMD) {
      year = matchYMD[1];
      month = matchYMD[2];
      day = matchYMD[3];
    } else {
      return query;
    }
  }

  if (day === '00') {
    const start = `${year}-${month}-01T00:00:00`;
    // El día 0 del mes siguiente es el último día del mes actual
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;
    return query.gte(campoFecha, start).lte(campoFecha, end);
  } else {
    const dateStr = `${year}-${month}-${day}`;
    return query.gte(campoFecha, `${dateStr}T00:00:00`).lte(campoFecha, `${dateStr}T23:59:59.999`);
  }
};

// La búsqueda de texto libre necesita cubrir dos casos distintos:
//  - 'equipo' y 'problema' son columnas propias de orden_servicio -> ilike directo.
//  - el nombre del cliente vive en la tabla 'clientes' (relacionada), y PostgREST
//    no permite un solo .or() que cruce dos tablas en una misma query. Por eso
//    primero buscamos los id_cliente que hagan match por nombre, y los metemos
//    como un id_clientes.in.(...) más dentro del mismo .or() de orden_servicio.
//
// IMPORTANTE: esta función es 'async' pero a propósito NUNCA regresa el query
// builder de supabase-js. El builder es "thenable" (tiene su propio .then()),
// así que si una función async hiciera 'return query' ahí mismo, JS lo trataría
// como una promesa y lo resolvería solo -> quien la llame con 'await' recibiría
// el RESULTADO ya ejecutado ({data, error, count}) en vez del builder, y
// cualquier .order()/.range() posterior tronaría con "no es una función".
// Por eso solo regresamos el string de la condición, y el .or() se aplica
// después, de forma síncrona, en cada función que arma su propia query.
const obtenerCondicionBusqueda = async (busqueda?: string): Promise<string | null> => {
  if (!busqueda) return null;
  const term = `%${busqueda}%`;

  const { data: clientesMatch, error: errorClientes } = await supabase
    .from('clientes')
    .select('id_cliente')
    .ilike('nombre', term);

  if (errorClientes) {
    console.error('Error buscando clientes para filtro de ordenes:', errorClientes);
  }

  const idsClientes = (clientesMatch ?? []).map((c: any) => c.id_cliente);

  const condiciones = [`equipo.ilike.${term}`, `problema.ilike.${term}`];
  if (idsClientes.length > 0) {
    condiciones.push(`id_clientes.in.(${idsClientes.join(',')})`);
  }

  const matchNum = busqueda.match(/^#?(\d+)$/);
  if (matchNum) {
    condiciones.push(`numero_orden.eq.${matchNum[1]}`);
  }

  return condiciones.join(',');
};

export const getOrdenes = async (
  page: number,
  porPagina: number = 5,
  filtros?: { estado?: string; responsable?: string; prioridad?: string; busqueda?: string; fecha?: string }
): Promise<{ data: Orden[]; count: number }> => {
  if (!estaOnline() && esDesktop()) {
    return getOrdenesLocalFiltradas(page, porPagina, { ...filtros, excluirFinalizadas: true });
  }

  const offset = (page - 1) * porPagina;

  let query = supabase
    .from('orden_servicio')
    .select(SELECT_ORDEN_COMPLETA, { count: 'exact' }) 
    .neq('estado', 'finalizado');

  if (filtros?.estado) query = query.eq('estado', filtros.estado);
  if (filtros?.responsable) query = query.eq('responsable', filtros.responsable);
  if (filtros?.prioridad) query = query.eq('prioridad', filtros.prioridad);
  const condicionBusqueda = await obtenerCondicionBusqueda(filtros?.busqueda);
  if (condicionBusqueda) query = query.or(condicionBusqueda);
  query = aplicarFiltroFecha(query, filtros?.fecha);

  const { data, error, count } = await query
    .order('created', { ascending: false })
    .range(offset, offset + porPagina - 1);

  if (error) {
    console.error('Error fetching ordenes paginadas, se intenta con el espejo local:', error);
    return getOrdenesLocalFiltradas(page, porPagina, { ...filtros, excluirFinalizadas: true });
  }

  return { data: (data ?? []) as unknown as Orden[], count: count ?? 0 };
};

// Reimplementa en memoria, sobre el espejo local (Dexie), el mismo filtrado
// que hace la query de arriba contra Supabase. Se usa tanto para la lista
// de pendientes como para finalizadas (con excluirFinalizadas invertido).
async function getOrdenesLocalFiltradas(
  page: number,
  porPagina: number,
  filtros?: {
    estado?: string;
    responsable?: string;
    prioridad?: string;
    busqueda?: string;
    fecha?: string;
    excluirFinalizadas?: boolean;
  }
): Promise<{ data: Orden[]; count: number }> {
  let ordenes = await getOrdenesLocal();
  const perfilActual = await obtenerPerfilOfflineActual();

  // Filtrado por rol (emulando RLS)
  if (perfilActual?.rol === 'minimo') {
    // Necesitamos saber en qué órdenes el técnico actual está como apoyo
    const apoyos = await localDb.orden_apoyo
      .where('id_tecnico').equals(perfilActual.id_perfil_info)
      .toArray();
    const ordenesApoyoIds = new Set(apoyos.map(a => a.id_orden_servicio));

    ordenes = ordenes.filter(
      (o) =>
        o.responsable === perfilActual.id_perfil_info ||
        o.realizado_por === perfilActual.id_perfil_info ||
        ordenesApoyoIds.has(o.id_orden_servicio)
    );
  }

  if (filtros?.excluirFinalizadas) ordenes = ordenes.filter((o) => o.estado !== 'finalizado');
  if (filtros?.estado) ordenes = ordenes.filter((o) => o.estado === filtros.estado);
  if (filtros?.responsable) ordenes = ordenes.filter((o) => o.responsable === filtros.responsable);
  if (filtros?.prioridad) ordenes = ordenes.filter((o) => o.prioridad === filtros.prioridad);
  if (filtros?.busqueda) {
    const term = filtros.busqueda.toLowerCase();
    const matchNum = term.match(/^#?(\d+)$/);
    const num = matchNum ? matchNum[1] : null;

    ordenes = ordenes.filter(
      (o) =>
        (num && (String(o.numero_orden) === num || String(o.numero_orden) === `local-${num}`)) ||
        o.equipo?.toLowerCase().includes(term) ||
        o.problema?.toLowerCase().includes(term) ||
        o.cliente?.nombre?.toLowerCase().includes(term)
    );
  }
  if (filtros?.fecha) {
    let year, month, day;
    const matchDMY = filtros.fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (matchDMY) {
      day = matchDMY[1]; month = matchDMY[2]; year = matchDMY[3];
    } else {
      const matchYMD = filtros.fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (matchYMD) { year = matchYMD[1]; month = matchYMD[2]; day = matchYMD[3]; }
    }

    if (year && month) {
      const campo = filtros.excluirFinalizadas === false || filtros.estado === 'finalizado' ? 'finalized_at' : 'created';
      if (day === '00') {
        const prefix = `${year}-${month}-`;
        ordenes = ordenes.filter((o) => (o as any)[campo]?.startsWith(prefix));
      } else {
        const targetDate = `${year}-${month}-${day}`;
        ordenes = ordenes.filter((o) => (o as any)[campo]?.startsWith(targetDate));
      }
    }
  }

  const count = ordenes.length;
  const from = (page - 1) * porPagina;
  return { data: ordenes.slice(from, from + porPagina), count };
}

export const getOrdenById = async (id: string): Promise<Orden | null> => {
  if (!estaOnline() && esDesktop()) {
    return (await getOrdenDetalleLocal(id)) as unknown as Orden | null;
  }

  const { data, error } = await supabase
    .from('orden_servicio')
    .select(SELECT_ORDEN_COMPLETA)
    .eq('id_orden_servicio', id)
    .single();

  if (error) {
    console.error('Error fetching orden by id, se intenta con el espejo local:', error);
    return (await getOrdenDetalleLocal(id)) as unknown as Orden | null;
  }

  return data as unknown as Orden;
};

export const getTodasOrdenes = async (): Promise<Orden[]> => {
  if (!estaOnline() && esDesktop()) {
    const locales = await getOrdenesLocal();
    return locales.map((o) => ({
      id_orden_servicio: o.id_orden_servicio,
      numero_orden: o.numero_orden,
      estado: o.estado,
      id_clientes: o.id_clientes,
    })) as unknown as Orden[];
  }

  const { data, error } = await supabase
    .from('orden_servicio')
    .select('id_orden_servicio, numero_orden, estado, id_clientes')
    .order('created', { ascending: false });

  if (error) {
    console.error('Error fetching todas las ordenes:', error);
    return [];
  }
  return data as unknown as Orden[];
};

// Folio ESTIMADO para la próxima orden a crear (para mostrarlo en vivo en el
// formulario de "Nueva orden"). No es un número reservado ni garantizado:
// como createOrdenConCliente encola la orden en peticion_queue y es el
// trigger fn_procesar_peticion quien de verdad la inserta (ignorando
// cualquier numero_orden que le mandemos), el folio real puede diferir si
// hay otras órdenes encoladas por delante o si el dispatcher tarda. Este
// valor solo sirve como referencia visual, no para lógica de negocio.
export const getUltimoNumeroOrden = async (): Promise<number> => {
  const { data, error } = await supabase
    .from('orden_servicio')
    .select('numero_orden')
    .order('numero_orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error obteniendo el último numero_orden:', error);
    return 0;
  }
  return (data?.numero_orden as number) ?? 0;
};

// enqueueOperacion solo confirma que la PETICIÓN quedó insertada en
// peticion_queue -- NO que fn_procesar_peticion ya terminó de crear la
// fila real en la tabla destino. Antes hacíamos polling desde el
// frontend esperando a que apareciera la fila, pero eso dependía de
// adivinar cuánto tarda el dispatcher en tomar la petición (podía
// tardar mucho más de lo esperado, hasta minutos). Ahora ya no hace
// falta: el propio trigger fn_procesar_peticion reintenta solo cuando
// una dependencia (cliente para una orden, empresa para un cliente)
// todavía no existe -- regresa la petición a 'pendiente' en vez de
// marcarla 'fallido', hasta que la dependencia se resuelva o se agoten
// los reintentos. Por eso basta con encolar en el orden correcto
// (empresa -> cliente -> orden) sin esperar confirmación en cada paso.

export const createOrdenConCliente = async (
  orden: any,
  idClienteExistente: string | null,
  clienteNuevo: any | null,
  empresaNueva: any | null = null
) => {
  let idCliente = idClienteExistente;

  if (!idCliente && clienteNuevo) {
    // Orden de creación obligatorio: empresa -> cliente -> orden. Si el
    // cliente nuevo viene ligado a una empresa que también es nueva, se
    // encola la empresa primero. No hace falta esperar a que se
    // confirme en Supabase: si la orden/cliente que la referencia se
    // procesa antes de que la empresa exista de verdad, el trigger la
    // reintenta solo (ver fn_procesar_peticion).
    //
    // clienteNuevo.id_empresa (si vino seteado, ej. una empresa YA
    // existente elegida en el formulario) se respeta tal cual; solo se
    // sobreescribe cuando de verdad se está creando una empresa nueva.
    // Si no hay empresaNueva ni id_empresa, el cliente queda sin empresa
    // (es válido: no todo cliente pertenece a una empresa).
    let idEmpresaParaCliente: string | null = clienteNuevo.id_empresa ?? null;

    if (empresaNueva) {
      const resultadoEmpresa = await crearEmpresaInline(empresaNueva);
      if (!resultadoEmpresa.success || !resultadoEmpresa.idEmpresa) {
        return {
          success: false,
          error: resultadoEmpresa.error || 'No se pudo crear la empresa.',
        };
      }
      idEmpresaParaCliente = resultadoEmpresa.idEmpresa;
    }

    idCliente = crypto.randomUUID();

    try {
      const resultadoCliente = await enqueueOperacion({
        operacion: 'insert',
        tabla_destino: 'clientes',
        payload: { ...clienteNuevo, id_empresa: idEmpresaParaCliente, id_cliente: idCliente },
      });

      if (resultadoCliente.guardadoLocal && esDesktop()) {
        await localDb.clientes.put({
          ...clienteNuevo,
          id_empresa: idEmpresaParaCliente,
          id_cliente: idCliente,
          es_actual: true,
          created: new Date().toISOString(),
        } as unknown as Cliente);
      }
    } catch (err: any) {
      return { success: false, error: 'Error al encolar creación de cliente: ' + (err.message || '') };
    }
  }

  if (!idCliente) return { success: false, error: 'No se pudo obtener el ID del cliente.' };

  // El id se genera aquí (no se deja que Supabase lo asigne) para que sea
  // el mismo id sin importar si la orden se manda directo o cae al buzón
  // local -- así se puede navegar a /orden/:id de inmediato en cualquiera
  // de los dos casos.
  const idOrden = crypto.randomUUID();
  const ordenPayload = {
    ...orden,
    id_orden_servicio: idOrden,
    id_clientes: idCliente,
  };

  let guardadoLocal = false;
  let numeroLocal: string | null = null;
  try {
    const resultado = await enqueueOperacion({
      operacion: 'insert',
      tabla_destino: 'orden_servicio',
      payload: ordenPayload,
    });
    guardadoLocal = resultado.guardadoLocal;
  } catch (err: any) {
    return { success: false, error: 'Error al encolar registro de orden: ' + (err.message || '') };
  }

  // Si no había internet, la orden real todavía no existe en Supabase (está
  // esperando en el buzón local). La reflejamos ya mismo en el espejo local
  // con un numero_orden temporal "local-N" -- el número real lo asigna el
  // trigger de Supabase (fn_procesar_peticion IGNORA cualquier numero_orden
  // que le mandemos, así que nunca hay que inventarlo nosotros para la
  // subida real, solo para mostrarlo mientras tanto). En cuanto esta orden
  // suba de verdad, Realtime va a traer la fila real con este mismo
  // id_orden_servicio y va a pisar el "local-N" con el número definitivo.
  if (guardadoLocal && esDesktop()) {
    const numeroLocalNum = await siguienteNumeroLocal('orden_servicio');
    numeroLocal = `local-${numeroLocalNum}`;
    const ahora = new Date().toISOString();
    await localDb.orden_servicio.put({
      ...ordenPayload,
      numero_orden: numeroLocal as unknown as number,
      estado: (ordenPayload as any).estado ?? 'pendiente',
      created: ahora,
      last_update: ahora,
    } as unknown as Orden);
  }

  // numeroLocal viene poblado solo si se guardó offline (folio temporal,
  // aún no es el definitivo). Si viene null, la orden se encoló en línea
  // y el folio real hay que esperarlo por Realtime (fn_procesar_peticion
  // lo asigna de forma asíncrona, no es instantáneo).
  return { success: true, idOrden, numeroLocal };
};

export const updateOrden = async (
  id: string,
  ordenData: Record<string, unknown>,
  datosOriginales: Record<string, unknown>,
  motivoCambio?: string
) => {
  const cambios: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ordenData)) {
    if (value !== undefined && value !== datosOriginales[key]) {
      cambios[key] = value;
    }
  }

  if (Object.keys(cambios).length === 0) {
    return { success: true };
  }

  cambios.last_update = new Date().toISOString();

  try {
    await enqueueOperacion({
      operacion: 'update',
      tabla_destino: 'orden_servicio',
      id_registro: id,
      payload: cambios,
      motivo_cambio: motivoCambio ?? null,
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error queueing orden update:', err);
    return { success: false, error: err.message };
  }
};

export const cerrarOrden = async (id: string, observaciones: string) => {
  try {
    await enqueueOperacion({
      operacion: 'update',
      tabla_destino: 'orden_servicio',
      id_registro: id,
      payload: {
        estado: 'finalizado',
        finalized_at: new Date().toISOString(),
        observaciones_finales: observaciones || null,
        last_update: new Date().toISOString(),
      },
      motivo_cambio: 'Cierre de orden',
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const procesarOrden = async (
  id: string,
  estadoActual: string
): Promise<{ success: boolean; error?: string }> => {
  if (estadoActual === 'en proceso') {
    return { success: false, error: 'La orden ya está en proceso.' };
  }

  try {
    await enqueueOperacion({
      operacion: 'update',
      tabla_destino: 'orden_servicio',
      id_registro: id,
      payload: { estado: 'en proceso', last_update: new Date().toISOString() },
      motivo_cambio: 'Orden puesta en proceso',
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error al procesar orden:', err);
    return { success: false, error: err.message };
  }
};

// ==========================================
// Historial — sustituto temporal de v_historial_ordenes (eliminada)
// ==========================================
export const getHistorialOrden = async (id: string) => {
  if (!estaOnline() && esDesktop()) {
    const data = await localDb.auditoria_log
      .where('id_registro')
      .equals(id)
      .toArray();
    return data.sort((a, b) => (a.created ?? '').localeCompare(b.created ?? ''));
  }

  const { data, error } = await supabase
    .from('auditoria_log')
    .select('*')
    .eq('tabla', 'orden_servicio')
    .eq('id_registro', id)
    .order('created', { ascending: true });

  if (error) {
    console.error('Error fetching historial:', error);
    return [];
  }
  return data;
};

// Mapa liviano id_orden_servicio -> numero_orden. Se usa para traducir
// el historial global de actividad (cierre_orden, orden_apoyo y
// orden_nota no guardan el numero_orden en su propia fila, solo el
// id_orden_servicio, así que hace falta este mapa para poder mostrar
// "Orden #123" en vez de un uuid).
export const getMapaNumerosOrden = async (): Promise<Map<string, number>> => {
  if (!estaOnline() && esDesktop()) {
    const locales = await getOrdenesLocal();
    return new Map(locales.map((o) => [o.id_orden_servicio, o.numero_orden as unknown as number]));
  }

  const { data, error } = await supabase
    .from('orden_servicio')
    .select('id_orden_servicio, numero_orden');

  if (error) {
    console.error('Error fetching mapa de numeros de orden:', error);
    return new Map();
  }
  return new Map((data ?? []).map((o: any) => [o.id_orden_servicio, o.numero_orden]));
};

// ==========================================
// Finalizadas
// ==========================================
export const getOrdenesFinalizadas = async (
  page: number,
  porPagina: number = 5,
  filtros?: { responsable?: string; prioridad?: string; busqueda?: string; fecha?: string }
): Promise<{ data: Orden[]; count: number }> => {
  if (!estaOnline() && esDesktop()) {
    return getOrdenesLocalFiltradas(page, porPagina, { ...filtros, estado: 'finalizado' });
  }

  const offset = (page - 1) * porPagina;

  let query = supabase
    .from('orden_servicio')
    .select(SELECT_ORDEN_COMPLETA, { count: 'exact' })
    .eq('estado', 'finalizado');

  if (filtros?.responsable) query = query.eq('responsable', filtros.responsable);
  if (filtros?.prioridad) query = query.eq('prioridad', filtros.prioridad);
  const condicionBusqueda = await obtenerCondicionBusqueda(filtros?.busqueda);
  if (condicionBusqueda) query = query.or(condicionBusqueda);
  query = aplicarFiltroFecha(query, filtros?.fecha, 'finalized_at');

  const { data, error, count } = await query
    .order('finalized_at', { ascending: false })
    .range(offset, offset + porPagina - 1);

  if (error) {
    console.error('Error fetching ordenes finalizadas, se intenta con el espejo local:', error);
    return getOrdenesLocalFiltradas(page, porPagina, { ...filtros, estado: 'finalizado' });
  }

  return { data: (data ?? []) as unknown as Orden[], count: count ?? 0 };
};

// ==========================================
// Dashboard
// ==========================================
export const getDashboardOrdenes = async (): Promise<Orden[]> => {
  if (!estaOnline() && esDesktop()) {
    let locales = await getOrdenesLocal();
    const perfilActual = await obtenerPerfilOfflineActual();

    // Filtrado por rol (emulando RLS) para dashboard
    if (perfilActual?.rol === 'minimo') {
      const apoyos = await localDb.orden_apoyo
        .where('id_tecnico').equals(perfilActual.id_perfil_info)
        .toArray();
      const ordenesApoyoIds = new Set(apoyos.map(a => a.id_orden_servicio));

      locales = locales.filter(
        (o) =>
          o.responsable === perfilActual.id_perfil_info ||
          o.realizado_por === perfilActual.id_perfil_info ||
          ordenesApoyoIds.has(o.id_orden_servicio)
      );
    }
    return locales as unknown as Orden[];
  }

  const { data, error } = await supabase
    .from('orden_servicio')
    .select(`
      id_orden_servicio, numero_orden, estado, prioridad, equipo,
      problema, created, last_update, finalized_at, id_clientes
    `)
    .order('last_update', { ascending: false });

  if (error) {
    console.error('Error fetching dashboard ordenes, se intenta con el espejo local:', error);
    const locales = await getOrdenesLocal();
    return locales as unknown as Orden[];
  }
  return data as unknown as Orden[];
};

// ==========================================
// Órdenes por cliente
// ==========================================
export const getOrdenesPorCliente = async (idCliente: string): Promise<Orden[]> => {
  if (!estaOnline() && esDesktop()) {
    const locales = await getOrdenesLocal();
    // Simplificación offline: solo compara contra este id_cliente puntual,
    // sin resolver toda la cadena de versiones (id_raiz) como sí hace la
    // consulta online -- ese cruce necesita ir a Supabase.
    return locales.filter((o) => o.id_clientes === idCliente) as unknown as Orden[];
  }

  // 1. Obtener el id_raiz del cliente para saber a qué "familia" de versiones pertenece
  const { data: clientData, error: clientError } = await supabase
    .from('clientes')
    .select('id_raiz')
    .eq('id_cliente', idCliente)
    .single();

  if (clientError && clientError.code !== 'PGRST116') {
    console.error('Error fetching client root id:', clientError);
    // Si falla, continuamos intentando buscar por el id original
  }

  const idRaiz = clientData?.id_raiz || idCliente;

  // 2. Obtener todos los IDs de las versiones de este cliente (incluyendo la raíz y sus descendientes)
  const { data: versionsData, error: versionsError } = await supabase
    .from('clientes')
    .select('id_cliente')
    .or(`id_raiz.eq.${idRaiz},id_cliente.eq.${idRaiz}`);

  if (versionsError) {
    console.error('Error fetching client versions:', versionsError);
    return [];
  }

  const idsClientes = versionsData && versionsData.length > 0 
    ? versionsData.map(v => v.id_cliente) 
    : [idCliente];

  // 3. Consultar las órdenes que estén en cualquiera de las versiones
  const { data, error } = await supabase
    .from('orden_servicio')
    .select(`
      id_orden_servicio, numero_orden, estado, prioridad, equipo,
      problema, created, finalized_at, id_clientes
    `)
    .in('id_clientes', idsClientes)
    .order('created', { ascending: false });

  if (error) {
    console.error('Error fetching ordenes por cliente:', error);
    return [];
  }
  return data as unknown as Orden[];
};

// ==========================================
// Apoyos de Orden (usa orden_apoyo — la tabla que realmente existe)
// ==========================================

export const getApoyosOrden = async (idOrden: string) => {
  if (!estaOnline() && esDesktop()) {
    const [apoyos, perfiles] = await Promise.all([
      localDb.orden_apoyo
        .where('[id_orden_servicio+id_tecnico]')
        .between([idOrden, ''], [idOrden, '\uffff'])
        .toArray(),
      localDb.perfil_info.toArray(),
    ]);
    const perfilesPorId = new Map(perfiles.map((p) => [p.id_perfil_info, p]));
    return apoyos
      .map((a) => ({
        ...a,
        tecnico_perfil: perfilesPorId.get(a.id_tecnico) ?? null,
        realizado_por_perfil: a.realizado_por ? perfilesPorId.get(a.realizado_por) ?? null : null,
      }))
      .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));
  }

  let query = supabase
    .from('orden_apoyo')
    .select(`
      *,
      tecnico_perfil:perfil_info!id_tecnico(id_perfil_info, nombres, apellido_paterno, apellido_materno),
      realizado_por_perfil:perfil_info!realizado_por(id_perfil_info, nombres, apellido_paterno, apellido_materno)
    `)
    .eq('id_orden_servicio', idOrden)
    .order('created', { ascending: false });



  const { data, error } = await query;

  if (error) {
    console.error('Error fetching apoyos de orden:', error);
    return [];
  }
  return data;
};

// ==========================================
// Notas de la Orden
// ==========================================

export const getNotasOrden = async (idOrden: string) => {
  if (!estaOnline() && esDesktop()) {
    const [notas, perfiles] = await Promise.all([
      localDb.orden_nota
        .where('[id_orden_servicio+created]')
        .between([idOrden, ''], [idOrden, '\uffff'])
        .toArray(),
      localDb.perfil_info.toArray(),
    ]);
    const perfilesPorId = new Map(perfiles.map((p) => [p.id_perfil_info, p]));
    return notas
      .map((n) => ({
        ...n,
        realizado_por_perfil: n.realizado_por ? perfilesPorId.get(n.realizado_por) ?? null : null,
        responsable_antes_perfil: n.responsable_antes
          ? perfilesPorId.get(n.responsable_antes) ?? null
          : null,
        responsable_despues_perfil: n.responsable_despues
          ? perfilesPorId.get(n.responsable_despues) ?? null
          : null,
      }))
      .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));
  }

  const { data, error } = await supabase
    .from('orden_nota')
    .select(`
      *,
      realizado_por_perfil:perfil_info!realizado_por(id_perfil_info, nombres, apellido_paterno, apellido_materno),
      responsable_antes_perfil:perfil_info!responsable_antes(id_perfil_info, nombres, apellido_paterno, apellido_materno),
      responsable_despues_perfil:perfil_info!responsable_despues(id_perfil_info, nombres, apellido_paterno, apellido_materno)
    `)
    .eq('id_orden_servicio', idOrden)
    .order('created', { ascending: false });

  if (error) {
    console.error('Error fetching notas de orden:', error);
    return [];
  }
  return data;
};