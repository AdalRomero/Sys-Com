/**
 * ordenDocumentHelpers.ts
 * Funciones para construir los documentos de orden de servicio
 * a partir de los tipos del sistema.
 */

import type { Orden, AsignacionApoyo, OrdenNota } from '../types/index';
import type {
  DocumentoOrdenInterno,
  DocumentoOrdenCliente,
  DatosEmpresaSyscom,
  ChecklistRecomendaciones,
  CierreServicio,
  EvaluacionCliente,
  TipoCierre,
} from '../types/documentos';
import { getEmpresaVigente } from '../service/configuracionEmpresa.service';

// ─── Datos constantes de Sys-Com (RESPALDO) ──────────────────────────────────
// Ya NO es la fuente de verdad: los datos vigentes viven en la tabla
// `configuracion_empresa` y se obtienen con getEmpresaVigente()
// (ver ../services/configuracionEmpresa.service.ts). Esta constante solo se
// usa como último respaldo si esa consulta falla y no se pasa `empresa`
// explícitamente a los builders de abajo.
export const EMPRESA_SYSCOM: DatosEmpresaSyscom = {
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

// ─── Helpers de nombre ───────────────────────────────────────────────────────
function buildNombre(perfil?: {
  nombres: string;
  apellido_paterno: string;
  apellido_materno?: string | null;
} | null): string {
  if (!perfil) return '—';
  return [perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno]
    .filter(Boolean)
    .join(' ');
}

// ─── Checklist vacío por defecto ─────────────────────────────────────────────
export function checklistVacio(): ChecklistRecomendaciones {
  return {
    respaldoInformacion: false,
    equiposBienConectados: false,
    notificarDesperfectos: false,
  };
}

// ─── Cierre vacío por defecto ─────────────────────────────────────────────────
export function cierreVacio(): CierreServicio {
  return {
    estado: null,
    tipo: null,
    capturado: false,
    montoACobrar: null,
    atendio: null,
  };
}

// ─── Evaluación vacía por defecto ────────────────────────────────────────────
export function evaluacionVacia(): EvaluacionCliente {
  return { calificacion: null, comentarios: null };
}

// ─── Resolver empresa (online -> local -> fallback) ──────────────────────────
/**
 * Si se pasa `empresa` explícita, se respeta tal cual (permite forzar un valor,
 * ej. en pruebas). Si no, se resuelve con getEmpresaVigente() (Supabase ->
 * espejo local Dexie -> EMPRESA_SYSCOM como último respaldo). Nunca lanza:
 * si getEmpresaVigente() fallara por completo, cae a EMPRESA_SYSCOM aquí mismo.
 */
async function resolverEmpresa(empresa?: DatosEmpresaSyscom): Promise<DatosEmpresaSyscom> {
  if (empresa) return empresa;
  try {
    return await getEmpresaVigente();
  } catch (e) {
    console.error('getEmpresaVigente() falló, se usa EMPRESA_SYSCOM de respaldo:', e);
    return EMPRESA_SYSCOM;
  }
}

// ─── Constructor del documento INTERNO ───────────────────────────────────────
/**
 * Construye un `DocumentoOrdenInterno` a partir de una `Orden` con sus joins resueltos.
 * Los parámetros opcionales sobreescriben los valores calculados automáticamente.
 *
 * NOTA: ahora es async porque, si no se pasa `options.empresa`, resuelve los
 * datos vigentes de la empresa con getEmpresaVigente() (Supabase -> espejo
 * local -> fallback). Los llamadores deben usar `await`.
 */
export async function buildDocumentoInterno(
  orden: Orden,
  options: {
    programadoCon?: string | null;
    checklist?: ChecklistRecomendaciones;
    cierre?: CierreServicio;
    apoyos?: AsignacionApoyo[];
    notas?: OrdenNota[];
    nombreFirmaCliente?: string | null;
    /** Datos vigentes de la empresa. Si se omite, se resuelve con getEmpresaVigente(). */
    empresa?: DatosEmpresaSyscom;
  } = {}
): Promise<DocumentoOrdenInterno> {
  const {
    programadoCon = null,
    checklist = checklistVacio(),
    cierre = cierreVacio(),
    apoyos = [],
    notas = [],
    nombreFirmaCliente = null,
    empresa,
  } = options;

  if (!orden.cliente) {
    throw new Error(`La orden #${orden.numero_orden} no tiene cliente resuelto (join faltante).`);
  }

  const empresaFinal = await resolverEmpresa(empresa);

  return {
    empresa: empresaFinal,
    orden,
    cliente: orden.cliente,
    tecnico: {
      nombreResponsable: buildNombre(orden.responsable_perfil),
      nombreRealizado: buildNombre(orden.realizado_por_perfil),
      apoyos,
      notas,
    },
    programadoCon,
    checklist,
    cierre,
    nombreFirmaCliente,
    estadoOrden: orden.estado,
  };
}

// ─── Constructor del documento CLIENTE ───────────────────────────────────────
/**
 * Construye un `DocumentoOrdenCliente` a partir de una `Orden` con sus joins resueltos.
 * `descripcionServicioCliente` debe ser redactada por el técnico para el cliente
 * (sin jerga interna, sin mencionar costos).
 *
 * NOTA: ahora es async por la misma razón que buildDocumentoInterno — resuelve
 * `empresa` con getEmpresaVigente() si no se pasa explícita. Usar con `await`.
 */
export async function buildDocumentoCliente(
  orden: Orden,
  descripcionServicioCliente: string,
  options: {
    contactoCliente?: string | null;
    tipoCierre?: TipoCierre | null;
    evaluacion?: EvaluacionCliente;
    nombreFirmaCliente?: string | null;
    hora?: string | null;
    resolucion?: string | null;
    /** Datos vigentes de la empresa. Si se omite, se resuelve con getEmpresaVigente(). */
    empresa?: DatosEmpresaSyscom;
  } = {}
): Promise<DocumentoOrdenCliente> {
  const {
    contactoCliente = null,
    tipoCierre = null,
    evaluacion = evaluacionVacia(),
    nombreFirmaCliente = null,
    hora = null,
    resolucion = null,
    empresa,
  } = options;

  if (!orden.cliente) {
    throw new Error(`La orden #${orden.numero_orden} no tiene cliente resuelto (join faltante).`);
  }

  const empresaFinal = await resolverEmpresa(empresa);

  return {
    empresa: empresaFinal,
    numeroOrden: orden.numero_orden,
    fecha: orden.created,
    hora,
    nombreCliente: orden.cliente.nombre ?? orden.cliente_nombre ?? '—',
    empresaCliente: orden.cliente.empresa?.nombre ?? null,
    contactoCliente,
    tipoServicio: orden.actividad,
    descripcionServicioCliente,
    estadoOrden: orden.estado,
    tipoCierre,
    tecnicoAtendio: buildNombre(orden.responsable_perfil),
    creadoPor: buildNombre(orden.realizado_por_perfil),
    fechaImpresion: new Date().toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }),
    evaluacion,
    nombreFirmaCliente,
    resolucion,
  };
}