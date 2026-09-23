import { supabase } from '../utils/supabase';
import { enqueueOperacion } from '../lib/syncService';
import { estaOnline } from '../lib/conexion';
import { getClientesActualesLocal, getEmpresasActualesLocal } from '../lib/localSelectors';
import { localDb } from '../lib/localdb';
import { esDesktop } from '../lib/entorno';

// =============================================================
// NOTA IMPORTANTE
// =============================================================
// El esquema nuevo eliminó las tablas 'cliente_frecuente' y
// 'cliente_ocasional'. Ahora todo vive en una sola tabla 'clientes',
// con 'id_empresa' opcional (FK a 'empresa') para cuando el cliente
// pertenece a una compañía. Por indicación tuya, este service YA NO
// distingue tipos de cliente en el frontend.
//
// También se eliminó la vista 'v_clientes_actuales' (aún no se
// recrea). Aquí la sustituyo consultando directamente 'clientes'
// filtrando por es_actual = true, que es exactamente lo que hacía
// esa vista según el patrón de versionado de tu trigger
// fn_procesar_peticion.
//
// AGREGADO (para el rediseño de Clientes.tsx con pestañas
// Clientes / Empresas, ambas paginadas):
//  - getEmpresasPaginadas: igual que getClientesPaginados pero
//    sobre 'empresa'.
//  - deleteEmpresa: encola el delete de una empresa (faltaba,
//    solo existía createEmpresa).
//  - getClientesPorEmpresa: para el panel lateral cuando se
//    selecciona una empresa, lista los clientes que le pertenecen.
//
// AGREGADO (para DetalleEmpresa.tsx, espejo de DetalleCliente.tsx):
//  - updateEmpresa: igual que updateCliente pero para 'empresa'
//    (mismo manejo de correccion vs. nueva version).
//  - getClientesParaAsignar: busca clientes candidatos a vincular
//    a una empresa (que no pertenezcan ya a ella), para el buscador
//    del panel "Vincular Clientes".
//  - asignarClientesAEmpresa: vincula (o desvincula, con
//    idEmpresa = null) uno o varios clientes de una sola vez,
//    encolando una petición 'update' por cliente.
// =============================================================

// ==========================================
// READ — CLIENTES
// ==========================================
export const getClientes = async (soloActivos: boolean = true) => {
  if (!estaOnline() && esDesktop()) {
    const locales = await getClientesActualesLocal(soloActivos);
    return [...locales].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  }

  let query = supabase
    .from('clientes')
    .select('*, empresa(*)')
    .eq('es_actual', true);

  if (soloActivos) query = query.eq('activo', true);

  const { data, error } = await query.order('nombre', { ascending: true });

  if (error) {
    console.error('Error fetching clientes, se intenta con el espejo local:', error);
    return getClientesActualesLocal(soloActivos);
  }
  return data;
};

export const getClientesPaginados = async (
  page: number,
  limit: number = 5,
  busqueda: string = ''
) => {
  if (!estaOnline() && esDesktop()) {
    let locales = await getClientesActualesLocal();
    if (busqueda) {
      const term = busqueda.toLowerCase();
      locales = locales.filter(
        (c) =>
          c.nombre?.toLowerCase().includes(term) ||
          c.correo?.toLowerCase().includes(term) ||
          c.telefono?.toLowerCase().includes(term)
      );
    }
    const from = (page - 1) * limit;
    return { data: locales.slice(from, from + limit), count: locales.length };
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('clientes')
    .select('*, empresa(*)', { count: 'exact' })
    .eq('es_actual', true);

  if (busqueda) {
    const term = `%${busqueda}%`;
    query = query.or(
      `nombre.ilike.${term},correo.ilike.${term},telefono.ilike.${term}`
    );
  }

  const { data, error, count } = await query
    .order('activo', { ascending: false })
    .order('created', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data, count: count ?? 0 };
};

export const getClienteById = async (id: string) => {
  if (!estaOnline() && esDesktop()) {
    const cliente = await localDb.clientes.get(id);
    if (!cliente) return null;
    const empresa = cliente.id_empresa ? await localDb.empresa.get(cliente.id_empresa) : null;
    return { ...cliente, empresa: empresa ?? null };
  }

  const { data, error } = await supabase
    .from('clientes')
    .select('*, empresa(*)')
    .eq('id_cliente', id)
    .single();

  if (error) {
    console.error('Error fetching cliente by id:', error);
    return null;
  }
  return data;
};

// Clientes que pertenecen a una empresa (para el panel lateral
// cuando se selecciona una empresa en la tabla, y para el detalle
// de empresa).
export const getClientesPorEmpresa = async (idEmpresa: string) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('id_cliente, nombre, correo, lada, telefono, activo')
    .eq('id_empresa', idEmpresa)
    .eq('es_actual', true)
    .order('activo', { ascending: false })
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error fetching clientes por empresa:', error);
    return [];
  }
  return data;
};

// Candidatos para vincular a una empresa: cualquier cliente actual
// que NO pertenezca ya a esa empresa (puede no tener empresa, o
// pertenecer a otra — reasignar es válido). Se usa en el buscador
// del panel "Vincular Clientes" de DetalleEmpresa.
export const getClientesParaAsignar = async (
  idEmpresa: string,
  busqueda: string = '',
  limit: number = 20
) => {
  let query = supabase
    .from('clientes')
    .select('id_cliente, nombre, correo, lada, telefono, id_empresa, activo')
    .eq('es_actual', true)
    .eq('activo', true) // Solo clientes activos para asignar
    .or(`id_empresa.is.null,id_empresa.neq.${idEmpresa}`);

  if (busqueda) {
    const term = `%${busqueda}%`;
    query = query.or(`nombre.ilike.${term},correo.ilike.${term}`);
  }

  const { data, error } = await query
    .order('nombre', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error buscando clientes para asignar:', error);
    return [];
  }
  return data;
};

// ==========================================
// CREATE: Enviar a la cola
// ==========================================
export const createCliente = async (clienteData: any) => {
  try {
    await enqueueOperacion({
      operacion: 'insert',
      tabla_destino: 'clientes',
      payload: clienteData,
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando creación de cliente:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// ==========================================
// UPDATE: Enviar a la cola
// ==========================================
// esCorreccion = true  -> corrige el registro actual in-place (fn_procesar_peticion
//                          hace UPDATE directo sobre la fila, sin versionar).
// esCorreccion = false -> crea una nueva versión (marca la actual es_actual=false
//                          e inserta una fila nueva con version+1).
export const updateCliente = async (
  id: string,
  clienteData: any,
  datosOriginales: any,
  esCorreccion: boolean = false,
  motivoCambio: string = ''
) => {
  const cambios: any = {};
  for (const [key, value] of Object.entries(clienteData)) {
    if (value !== undefined && value !== datosOriginales[key]) {
      cambios[key] = value;
    }
  }

  if (Object.keys(cambios).length === 0) {
    return { success: true };
  }

  const peticion = {
    operacion: (esCorreccion ? 'correccion' : 'update') as 'correccion' | 'update',
    tabla_destino: 'clientes' as const,
    id_registro: id,
    payload: cambios,
    es_correccion: esCorreccion,
    motivo_cambio: motivoCambio || null,
  };

  try {
    await enqueueOperacion(peticion);
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando actualización de cliente:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// Vincula (o desvincula, pasando idEmpresa = null) uno o varios
// clientes de una sola vez. No pasa por el diffing de updateCliente
// porque siempre es el mismo campo (id_empresa) el que cambia;
// encola una petición 'update' independiente por cada cliente para
// que fn_procesar_peticion las procese una por una.
export const asignarClientesAEmpresa = async (
  idsClientes: string[],
  idEmpresa: string | null
) => {
  if (idsClientes.length === 0) return { success: true };

  try {
    await Promise.all(
      idsClientes.map((idCliente) =>
        enqueueOperacion({
          operacion: 'update',
          tabla_destino: 'clientes',
          id_registro: idCliente,
          payload: { id_empresa: idEmpresa },
        })
      )
    );
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando asignación de clientes a empresa:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// ==========================================
// DELETE: Enviar a la cola
// ==========================================
export const deleteCliente = async (id: string) => {
  try {
    await enqueueOperacion({
      operacion: 'delete',
      tabla_destino: 'clientes',
      id_registro: id,
      payload: {}, // payload NOT NULL en peticion_queue
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando eliminación de cliente:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// Activa o desactiva un cliente (soft-delete toggle).
// Solo envía { activo } en el payload — fn_procesar_peticion lo aplica
// directamente sin generar nueva versión ni tocar la lógica de corrección.
export const toggleActivoCliente = async (id: string, activo: boolean) => {
  try {
    await enqueueOperacion({
      operacion: 'update',
      tabla_destino: 'clientes',
      id_registro: id,
      payload: { activo },
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando cambio de estado del cliente:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// ==========================================
// EMPRESAS
// ==========================================
export const getEmpresas = async () => {
  if (!estaOnline() && esDesktop()) {
    const locales = await getEmpresasActualesLocal();
    return [...locales].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  }

  const { data, error } = await supabase
    .from('empresa')
    .select('*')
    .eq('es_actual', true)
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error fetching empresas, se intenta con el espejo local:', error);
    return getEmpresasActualesLocal();
  }
  return data;
};

export const getEmpresasPaginadas = async (
  page: number,
  limit: number = 5,
  busqueda: string = ''
) => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('empresa')
    .select('*', { count: 'exact' })
    .eq('es_actual', true);

  if (busqueda) {
    const term = `%${busqueda}%`;
    query = query.or(
      `nombre.ilike.${term},correo.ilike.${term},telefono.ilike.${term}`
    );
  }

  const { data, error, count } = await query
    .order('created', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data, count: count ?? 0 };
};

export const getEmpresaById = async (id: string) => {
  if (!estaOnline() && esDesktop()) {
    return (await localDb.empresa.get(id)) ?? null;
  }

  const { data, error } = await supabase
    .from('empresa')
    .select('*')
    .eq('id_empresa', id)
    .single();

  if (error) {
    console.error('Error fetching empresa by id:', error);
    return null;
  }
  return data;
};

export const createEmpresa = async (empresaData: any) => {
  try {
    await enqueueOperacion({
      operacion: 'insert',
      tabla_destino: 'empresa',
      payload: empresaData,
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando creación de empresa:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// enqueueOperacion solo confirma que la PETICIÓN quedó insertada en
// peticion_queue -- NO que fn_procesar_peticion ya terminó de crear la
// fila real en 'empresa'. Antes hacíamos polling desde el frontend
// esperando a que apareciera la fila, pero eso dependía de adivinar
// cuánto tarda el dispatcher en tomar la petición (podía tardar mucho
// más de lo esperado, hasta minutos). Ahora ya no hace falta: el propio
// trigger fn_procesar_peticion reintenta solo cuando una dependencia
// (empresa para un cliente, cliente para una orden) todavía no existe
// -- regresa la petición a 'pendiente' en vez de marcarla 'fallido',
// hasta que la dependencia se resuelva o se agoten los reintentos. Por
// eso basta con encolar en el orden correcto (empresa -> cliente ->
// orden) y usar de inmediato el id generado en el cliente como FK del
// siguiente paso, sin esperar confirmación en cada escalón.
export const crearEmpresaInline = async (
  empresaData: any
): Promise<{ success: boolean; idEmpresa?: string; error?: string }> => {
  const idEmpresa = crypto.randomUUID();

  try {
    const resultado = await enqueueOperacion({
      operacion: 'insert',
      tabla_destino: 'empresa',
      payload: { ...empresaData, id_empresa: idEmpresa },
    });

    if (resultado.guardadoLocal && esDesktop()) {
      await localDb.empresa.put({
        ...empresaData,
        id_empresa: idEmpresa,
        es_actual: true,
        created: new Date().toISOString(),
      } as any);
    }

    return { success: true, idEmpresa };
  } catch (err: any) {
    console.error('Error encolando creación de empresa:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

// Mismo patrón que updateCliente: solo encola los campos que
// realmente cambiaron respecto a datosOriginales, y respeta el
// mismo manejo de es_correccion / motivo_cambio para versionado.
export const updateEmpresa = async (
  id: string,
  empresaData: any,
  datosOriginales: any,
  esCorreccion: boolean = false,
  motivoCambio: string = ''
) => {
  const cambios: any = {};
  for (const [key, value] of Object.entries(empresaData)) {
    if (value !== undefined && value !== datosOriginales[key]) {
      cambios[key] = value;
    }
  }

  if (Object.keys(cambios).length === 0) {
    return { success: true };
  }

  const peticion = {
    operacion: (esCorreccion ? 'correccion' : 'update') as 'correccion' | 'update',
    tabla_destino: 'empresa' as const,
    id_registro: id,
    payload: cambios,
    es_correccion: esCorreccion,
    motivo_cambio: motivoCambio || null,
  };

  try {
    await enqueueOperacion(peticion);
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando actualización de empresa:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

export const deleteEmpresa = async (id: string) => {
  try {
    await enqueueOperacion({
      operacion: 'delete',
      tabla_destino: 'empresa',
      id_registro: id,
      payload: {},
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error encolando eliminación de empresa:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};