import { supabase } from '../utils/supabase';
import { estaOnline } from '../lib/conexion';
import { esDesktop } from '../lib/entorno';
import { localDb } from '../lib/localdb';
import type { ConfiguracionEmpresa } from '../types/mirror';
import type { DatosEmpresaSyscom } from '../types/documentos';

// ─── Valor de última instancia ───────────────────────────────────────────────
// Se usa SOLO si falla Supabase y no hay nada en el espejo local (ej. primer
// arranque offline, antes de que hydrateAll() haya bajado nunca la tabla).
// Cámbialo aquí si alguna vez cambian estos datos "de emergencia" — aunque
// lo normal, una vez migrado, es editar la fila en configuracion_empresa.
const EMPRESA_SYSCOM_FALLBACK: DatosEmpresaSyscom = {
  nombre: 'Empresa Demo SA de CV',
  slogan: 'Servicios de demostración',
  responsable: 'Responsable de Ti',
  email: 'contacto@tuempresa.com',
  direccion: 'Calle Falsa 123, Ciudad, País',
  codigoPostal: '00000',
  telefono: '(000) 00 0 00 00',
  fax: '(000) 00 0 00 00',
  rfc: 'ABC010101XYZ',
};

// Mapea la fila de la tabla (snake_case) al tipo que ya consumen los
// documentos (camelCase), para no tener que tocar DatosEmpresaSyscom.
function mapConfiguracionADatosEmpresa(fila: ConfiguracionEmpresa): DatosEmpresaSyscom {
  return {
    nombre: fila.nombre,
    slogan: fila.slogan ?? '',
    responsable: fila.responsable_nombre ?? '',
    email: fila.email ?? '',
    direccion: fila.direccion ?? '',
    codigoPostal: fila.codigo_postal ?? '',
    telefono: fila.telefono ?? '',
    fax: fila.fax ?? null,
    rfc: fila.rfc ?? '',
  };
}

async function getConfiguracionEmpresaLocal(): Promise<DatosEmpresaSyscom | null> {
  try {
    const fila = await localDb.configuracion_empresa
      .filter((f) => f.es_actual === true)
      .first();
    return fila ? mapConfiguracionADatosEmpresa(fila) : null;
  } catch (e) {
    console.warn('Error leyendo configuracion_empresa local:', e);
    return null;
  }
}

/**
 * Trae los datos vigentes de la empresa (Sys-Com) para los documentos de orden.
 *
 * Orden de prioridad (mismo espíritu que ordenes_service.ts):
 *  1. Online -> Supabase directo (siempre el dato más fresco).
 *  2. Si falla y estamos en el exe de escritorio -> espejo local (Dexie).
 *  3. Si todo lo anterior falla -> constante EMPRESA_SYSCOM_FALLBACK, para
 *     que los documentos JAMÁS se rompan por no tener datos de la empresa.
 */
export async function getEmpresaVigente(): Promise<DatosEmpresaSyscom> {
  if (estaOnline()) {
    const { data, error } = await supabase
      .from('configuracion_empresa')
      .select('*')
      .eq('es_actual', true)
      .maybeSingle();

    if (!error && data) {
      return mapConfiguracionADatosEmpresa(data as ConfiguracionEmpresa);
    }

    if (error) {
      console.error('Error fetching configuracion_empresa, se intenta con el espejo local:', error);
    }
  }

  if (esDesktop()) {
    const local = await getConfiguracionEmpresaLocal();
    if (local) return local;
  }

  return EMPRESA_SYSCOM_FALLBACK;
}

// =====================================================================
// ── CRUD de administración (solo para pantalla de Configuración) ────
// =====================================================================
// La tabla configuracion_empresa está diseñada como un historial
// versionado, no como una fila que se edita en sitio:
//   - Índice único parcial: solo puede haber UNA fila con es_actual=true.
//   - Tiene motivo_cambio + editado_por, pensados para auditar cada
//     cambio de datos de la empresa a través del tiempo.
// Por eso "actualizar" aquí significa: desactivar la fila vigente e
// insertar una fila nueva como la nueva vigente — nunca se hace UPDATE
// sobre los datos de una fila ya existente.

/**
 * Trae la fila vigente completa (incluye metadatos: id, motivo_cambio,
 * editado_por, created, last_update), para prellenar el formulario de
 * edición en la pantalla de administración. A diferencia de
 * getEmpresaVigente(), esta SIEMPRE va contra Supabase (requiere admin
 * online) y no cae a espejo local ni fallback.
 */
export async function getConfiguracionEmpresaCompleta(): Promise<ConfiguracionEmpresa | null> {
  const { data, error } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .eq('es_actual', true)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo obtener la configuración vigente: ${error.message}`);
  }
  return (data as ConfiguracionEmpresa) ?? null;
}

/**
 * Trae las últimas versiones de la configuración de la empresa (vigente +
 * historial), para mostrar de dónde viene cada cambio (quién, cuándo, por qué).
 */
export async function getHistorialConfiguracionEmpresa(limite = 15): Promise<ConfiguracionEmpresa[]> {
  const { data, error } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .order('created', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('Error obteniendo historial de configuracion_empresa:', error);
    return [];
  }
  return (data ?? []) as ConfiguracionEmpresa[];
}

export interface DatosEmpresaEditables {
  nombre: string;
  slogan?: string | null;
  responsable?: string | null;
  email?: string | null;
  direccion?: string | null;
  codigoPostal?: string | null;
  telefono?: string | null;
  fax?: string | null;
  rfc?: string | null;
}

/**
 * Crea una nueva versión vigente de la configuración de la empresa.
 * Requiere estar en línea (esto NO pasa por peticion_queue/syncService,
 * ya que es una operación administrativa poco frecuente y sensible que
 * conviene confirmar siempre contra el servidor de inmediato).
 *
 * `motivoCambio` es obligatorio: queda guardado en la fila para dejar
 * rastro de por qué se actualizaron los datos (además del trigger de
 * auditoría, que registra el evento pero no siempre el "por qué").
 *
 * IMPORTANTE — no es atómico: son dos llamadas separadas a Supabase
 * (1. desactivar la fila vigente, 2. insertar la nueva). Si el paso 2
 * falla después de que el paso 1 tuvo éxito, quedarías momentáneamente
 * SIN fila vigente (es_actual=true) hasta reintentar — getEmpresaVigente()
 * seguiría funcionando igual porque cae a espejo local / fallback, pero
 * conviene resolverlo con una función de Postgres (RPC) que envuelva
 * ambos pasos en una sola transacción si esto se usa con frecuencia.
 */
export async function actualizarConfiguracionEmpresa(
  datos: DatosEmpresaEditables,
  motivoCambio: string,
  idPerfilEditor: string
): Promise<DatosEmpresaSyscom> {
  if (!estaOnline()) {
    throw new Error('Se requiere conexión a internet para actualizar la configuración de la empresa.');
  }
  if (!motivoCambio.trim()) {
    throw new Error('Indica el motivo del cambio antes de guardar.');
  }
  if (!datos.nombre.trim()) {
    throw new Error('El nombre de la empresa es obligatorio.');
  }

  // 1) Desactivar la fila vigente actual (si existe).
  const { error: errorDesactivar } = await supabase
    .from('configuracion_empresa')
    .update({ es_actual: false })
    .eq('es_actual', true);

  if (errorDesactivar) {
    throw new Error(`No se pudo desactivar la configuración anterior: ${errorDesactivar.message}`);
  }

  // 2) Insertar la nueva fila vigente.
  const { data, error: errorInsertar } = await supabase
    .from('configuracion_empresa')
    .insert({
      nombre: datos.nombre.trim(),
      slogan: datos.slogan?.trim() || null,
      responsable_nombre: datos.responsable?.trim() || null,
      email: datos.email?.trim() || null,
      direccion: datos.direccion?.trim() || null,
      codigo_postal: datos.codigoPostal?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      fax: datos.fax?.trim() || null,
      rfc: datos.rfc?.trim() || null,
      es_actual: true,
      motivo_cambio: motivoCambio.trim(),
      editado_por: idPerfilEditor,
    })
    .select('*')
    .single();

  if (errorInsertar || !data) {
    throw new Error(
      `No se pudo guardar la nueva configuración: ${errorInsertar?.message ?? 'sin datos de respuesta'}. ` +
      `La configuración anterior quedó desactivada — vuelve a intentar para restaurar una fila vigente.`
    );
  }

  return mapConfiguracionADatosEmpresa(data as ConfiguracionEmpresa);
}