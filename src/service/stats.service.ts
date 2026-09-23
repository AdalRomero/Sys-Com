import { supabase } from '../utils/supabase';
import { estaOnline } from '../lib/conexion';
import { localDb, obtenerPerfilOfflineActual } from '../lib/localdb';
import { getClientesActualesLocal } from '../lib/localSelectors';
import { esDesktop } from '../lib/entorno';

/**
 * get_stats_filtradas NO tiene una vista SQL detrás (a diferencia de
 * get_stats_por_cliente) -- es una función que agrupa/filtra del lado del
 * servidor y su lógica exacta no está disponible para replicarla en el
 * cliente. Por eso, a propósito, esta NO tiene fallback local: adivinar
 * cómo agrupa daría números que se ven bien pero podrían estar mal.
 *
 * Cuando no hay internet, regresa { disponible: false } explícito en vez
 * de null, para que la pantalla pueda distinguir "sin conexión, no se
 * puede generar este reporte" de "hubo un error". Úsalo así en el
 * componente que llama esto:
 *
 *   const resultado = await getStatsFiltradas(...);
 *   if (!resultado.disponible) {
 *     // mostrar "Este reporte necesita conexión a internet" + <OfflineDataBanner />
 *   } else {
 *     // usar resultado.data como antes
 *   }
 */
export const getStatsFiltradas = async (
  tecnico?: string,
  fechaInicio?: string,
  fechaFin?: string
): Promise<{ disponible: boolean; data: any | null }> => {
  if (!estaOnline() && esDesktop()) {
    return { disponible: false, data: null };
  }

  const params = {
    p_tecnico:      tecnico     || null,
    p_estado:       null,          
    p_fecha_inicio: fechaInicio || null,
    p_fecha_fin:    fechaFin    || null,
  };

  const { data, error } = await supabase.rpc('get_stats_filtradas', params);

  if (error) {
    console.error('Error RPC get_stats_filtradas:', error);
    // Un error real de RPC (no de red) se distingue de "sin conexión":
    // esto sí es un error, así que disponible=true pero data=null.
    return { disponible: true, data: null };
  }
  return { disponible: true, data };
};

/**
 * get_stats_por_cliente SÍ tiene una vista SQL detrás (v_stats_por_cliente,
 * ver rollback_snapshot.sql), así que su lógica es simple y replicable:
 * por cada cliente actual, cuenta sus órdenes y promedia las horas entre
 * creación y cierre de las que ya están finalizadas. Offline, se recalcula
 * exactamente igual mochila con lo que ya hay en el espejo local
 * (localDb.clientes / empresa / orden_servicio).
 *
 * OJO: como el espejo local puede estar desactualizado (última vez que
 * hubo internet), estos números offline pueden no reflejar cambios hechos
 * en otros dispositivos mientras tanto -- muestra <OfflineDataBanner />
 * junto a este reporte cuando estaOnline() sea false.
 */
export const getStatsPorCliente = async () => {
  if (!estaOnline() && esDesktop()) {
    return calcularStatsPorClienteLocal();
  }

  const { data, error } = await supabase
    .rpc('get_stats_por_cliente')
    .order('total_ordenes', { ascending: false });

  if (error) {
    console.error('Error fetching stats_por_cliente, se intenta con el espejo local:', error);
    return calcularStatsPorClienteLocal();
  }
  return data || [];
};

async function calcularStatsPorClienteLocal() {
  const [clientes, empresas, ordenes, perfilActual] = await Promise.all([
    getClientesActualesLocal(),
    localDb.empresa.toArray(),
    localDb.orden_servicio.toArray(),
    obtenerPerfilOfflineActual(),
  ]);

  let ordenesFiltradas = ordenes;

  if (perfilActual?.rol === 'minimo') {
    const userId = perfilActual.id_perfil_info;
    const apoyos = await localDb.orden_apoyo
      .where('id_tecnico').equals(userId)
      .toArray();
    const ordenesApoyoIds = Array.from(new Set(apoyos.map(a => a.id_orden_servicio)));

    const ordenesDirectas = await localDb.orden_servicio
      .where('responsable').equals(userId)
      .or('realizado_por').equals(userId)
      .toArray();

    const ordenesPorApoyo = ordenesApoyoIds.length > 0
      ? await localDb.orden_servicio.where('id_orden_servicio').anyOf(ordenesApoyoIds).toArray()
      : [];

    const idsPermitidos = new Set([
      ...ordenesDirectas.map(o => o.id_orden_servicio),
      ...ordenesPorApoyo.map(o => o.id_orden_servicio)
    ]);

    ordenesFiltradas = ordenesFiltradas.filter(o => idsPermitidos.has(o.id_orden_servicio));
  }

  const empresasPorId = new Map(empresas.map((e) => [e.id_empresa, e]));
  const ordenesPorCliente = new Map<string, typeof ordenesFiltradas>();
  for (const o of ordenesFiltradas) {
    if (!o.id_clientes) continue;
    const lista = ordenesPorCliente.get(o.id_clientes) ?? [];
    lista.push(o);
    ordenesPorCliente.set(o.id_clientes, lista);
  }

  const stats = clientes.map((c) => {
    const ordenesDelCliente = ordenesPorCliente.get(c.id_cliente) ?? [];
    const finalizadasConTiempo = ordenesDelCliente.filter(
      (o) => o.estado === 'finalizado' && o.finalized_at && o.created
    );

    let tiempoPromedioHs: number | null = null;
    if (finalizadasConTiempo.length > 0) {
      const totalHoras = finalizadasConTiempo.reduce((acc, o) => {
        const horas =
          (new Date(o.finalized_at as string).getTime() - new Date(o.created as string).getTime()) /
          (1000 * 60 * 60);
        return acc + horas;
      }, 0);
      tiempoPromedioHs = Math.round((totalHoras / finalizadasConTiempo.length) * 10) / 10;
    }

    return {
      id_cliente: c.id_cliente,
      empresa: c.id_empresa ? empresasPorId.get(c.id_empresa)?.nombre ?? null : null,
      total_ordenes: ordenesDelCliente.length,
      tiempo_prom_resolucion_hs: tiempoPromedioHs,
    };
  });

  return stats.sort((a, b) => b.total_ordenes - a.total_ordenes);
}