import { localDb, obtenerPerfilOfflineActual } from '../lib/localdb';
import type { Orden, Cliente, Usuario } from '../types';

function resumenPerfil(u?: Usuario) {
  if (!u) return null;
  return {
    id_perfil_info: u.id_perfil_info,
    nombres: u.nombres,
    apellido_paterno: u.apellido_paterno,
    apellido_materno: u.apellido_materno,
    usuario: u.usuario,
  };
}

/** Solo la versión vigente (es_actual = true) de cada empresa */
export async function getEmpresasActualesLocal() {
  return localDb.empresa.filter((e) => e.es_actual !== false).toArray();
}

/** Solo la versión vigente de cada cliente, con su empresa resuelta */
export async function getClientesActualesLocal(soloActivos: boolean = false): Promise<Cliente[]> {
  const [clientes, empresas, perfilActual] = await Promise.all([
    localDb.clientes.filter((c) => c.es_actual !== false && (!soloActivos || c.activo !== false)).toArray(),
    localDb.empresa.toArray(),
    obtenerPerfilOfflineActual(),
  ]);
  const empresasPorId = new Map(empresas.map((e) => [e.id_empresa, e]));

  let clientesFiltrados = clientes;

  if (perfilActual?.rol === 'minimo') {
    const userId = perfilActual.id_perfil_info;
    // Obtener apoyos del usuario
    const apoyos = await localDb.orden_apoyo
      .where('id_tecnico').equals(userId)
      .toArray();
    const ordenesApoyoIds = Array.from(new Set(apoyos.map(a => a.id_orden_servicio)));

    // Obtener órdenes donde el usuario participa
    const ordenesDirectas = await localDb.orden_servicio
      .where('responsable').equals(userId)
      .or('realizado_por').equals(userId)
      .toArray();

    // Obtener órdenes donde es apoyo (por ID)
    const ordenesPorApoyo = ordenesApoyoIds.length > 0 
      ? await localDb.orden_servicio.where('id_orden_servicio').anyOf(ordenesApoyoIds).toArray()
      : [];
    
    const clientesIdsPermitidos = new Set([
      ...ordenesDirectas.map(o => o.id_clientes),
      ...ordenesPorApoyo.map(o => o.id_clientes)
    ]);
    
    clientesFiltrados = clientesFiltrados.filter(c => clientesIdsPermitidos.has(c.id_cliente));
  }

  return clientesFiltrados.map((c) => ({
    ...c,
    empresa: c.id_empresa ? empresasPorId.get(c.id_empresa) ?? null : null,
  }));
}

let _cacheOrdenesJoined: Orden[] | null = null;

export function invalidarCacheOrdenesLocal() {
  _cacheOrdenesJoined = null;
}

/** Todas las órdenes con cliente y responsables ya resueltos desde el espejo local */
export async function getOrdenesLocal(): Promise<Orden[]> {
  if (_cacheOrdenesJoined) return _cacheOrdenesJoined;

  const [ordenes, clientes, perfiles] = await Promise.all([
    localDb.orden_servicio.orderBy('created').reverse().toArray(),
    localDb.clientes.toArray(),
    localDb.perfil_info.toArray(),
  ]);

  const clientesPorId = new Map(clientes.map((c) => [c.id_cliente, c]));
  const perfilesPorId = new Map(perfiles.map((p) => [p.id_perfil_info, p]));

  _cacheOrdenesJoined = ordenes.map((o) => ({
    ...o,
    cliente: o.id_clientes ? clientesPorId.get(o.id_clientes) ?? null : null,
    responsable_perfil: resumenPerfil(o.responsable ? perfilesPorId.get(o.responsable) : undefined),
    realizado_por_perfil: resumenPerfil(
      o.realizado_por ? perfilesPorId.get(o.realizado_por) : undefined
    ),
  }));

  return _cacheOrdenesJoined;
}

/** Una orden puntual, con cliente, responsables, notas, apoyos y cierre resueltos */
export async function getOrdenDetalleLocal(id_orden_servicio: string) {
  const [orden, notas, apoyos, cierre] = await Promise.all([
    localDb.orden_servicio.get(id_orden_servicio),
    localDb.orden_nota.where('id_orden_servicio').equals(id_orden_servicio).toArray(),
    localDb.orden_apoyo.where('id_orden_servicio').equals(id_orden_servicio).toArray(),
    localDb.cierre_orden.where('id_orden_servicio').equals(id_orden_servicio).first(),
  ]);

  if (!orden) return null;

  // Recopilar solo los IDs de perfil que realmente necesitamos
  // (responsable, realizado_por, cada nota, cada apoyo)
  const perfilIds = new Set<string>();
  if (orden.responsable) perfilIds.add(orden.responsable);
  if (orden.realizado_por) perfilIds.add(orden.realizado_por);
  for (const n of notas) if (n.realizado_por) perfilIds.add(n.realizado_por);
  for (const a of apoyos) perfilIds.add(a.id_tecnico);

  // bulkGet trae solo esos perfiles por PK — O(k) en vez de O(n total de perfil_info)
  // Se ejecuta en paralelo con la búsqueda del cliente
  const [perfilesArr, cliente] = await Promise.all([
    localDb.perfil_info.bulkGet(Array.from(perfilIds)),
    orden.id_clientes ? localDb.clientes.get(orden.id_clientes) : undefined,
  ]);

  const perfilesPorId = new Map<string, Usuario>();
  for (const p of perfilesArr) {
    if (p) perfilesPorId.set(p.id_perfil_info, p);
  }

  return {
    ...orden,
    cliente: cliente ?? null,
    responsable_perfil: resumenPerfil(
      orden.responsable ? perfilesPorId.get(orden.responsable) : undefined
    ),
    realizado_por_perfil: resumenPerfil(
      orden.realizado_por ? perfilesPorId.get(orden.realizado_por) : undefined
    ),
    notas: notas.map((n) => ({
      ...n,
      realizado_por_perfil: resumenPerfil(
        n.realizado_por ? perfilesPorId.get(n.realizado_por) : undefined
      ),
    })),
    apoyos: apoyos.map((a) => ({
      ...a,
      tecnico_perfil: resumenPerfil(perfilesPorId.get(a.id_tecnico)),
    })),
    cierre: cierre ?? null,
  };
}


/** Notificaciones de un usuario, más recientes primero */
export async function getNotificacionesLocal(id_usuario: string) {
  return localDb.notificaciones
    .where('id_usuario')
    .equals(id_usuario)
    .reverse()
    .sortBy('created');
}
