// =============================================
// Syscom — Tipos para Documentos de Orden
// =============================================

import type { Orden, Cliente, AsignacionApoyo, OrdenNota } from './index';

// -----------------------------------------------
// Datos de la empresa Sys-Com (constantes)
// -----------------------------------------------
export interface DatosEmpresaSyscom {
  nombre: string;
  slogan: string;
  responsable: string;
  email: string;
  direccion: string;
  codigoPostal: string;
  telefono: string;
  fax?: string | null;
  rfc: string;
}

// -----------------------------------------------
// Evaluación del cliente (solo en documento cliente)
// -----------------------------------------------
export type CalificacionServicio = 'bueno' | 'regular' | 'malo' | null;

export interface EvaluacionCliente {
  calificacion: CalificacionServicio;
  comentarios?: string | null;
}

// -----------------------------------------------
// Checklist de recomendaciones (visible en ambos)
// -----------------------------------------------
export interface ChecklistRecomendaciones {
  respaldoInformacion: boolean;
  equiposBienConectados: boolean;
  notificarDesperfectos: boolean;
}

// -----------------------------------------------
// Cierre del servicio (solo documento interno)
// -----------------------------------------------
export type EstadoCierre = 'si' | 'no' | 'cancelado' | null;
export type TipoCierre = 'poliza' | 'garantia' | 'cortesia' | null;

export interface CierreServicio {
  estado: EstadoCierre;
  tipo: TipoCierre;
  capturado: boolean;
  montoACobrar?: number | string | null;
  atendio?: string | null; // nombre / firma del técnico que cerró
}

// -----------------------------------------------
// Datos extra de contexto para el técnico
// -----------------------------------------------
export interface InfoTecnico {
  /** Nombre completo del técnico responsable */
  nombreResponsable: string;
  /** Nombre completo de quien creó/registró la orden */
  nombreRealizado: string;
  /** Apoyos adicionales asignados */
  apoyos?: AsignacionApoyo[];
  /** Notas internas de la orden */
  notas?: OrdenNota[];
}

// -----------------------------------------------
// Datos completos para el documento INTERNO
// Solo para uso del personal de Sys-Com
// -----------------------------------------------
export interface DocumentoOrdenInterno {
  empresa: DatosEmpresaSyscom;
  

  orden: Orden;
  cliente: Cliente;

  /** Info del técnico que atiende y quien registró */
  tecnico: InfoTecnico;
  

  /** Persona con quien se programó / habló del cliente */
  programadoCon?: string | null;

  checklist: ChecklistRecomendaciones;
  cierre: CierreServicio;

  /** Firma del cliente (nombre impreso) */
  nombreFirmaCliente?: string | null;
  estadoOrden: import('./index').EstadoOrden;

  resolucion?: string | null;
}

// -----------------------------------------------
// Datos completos para el documento del CLIENTE
// Solo información que el cliente puede ver
// -----------------------------------------------
export interface DocumentoOrdenCliente {
  /** Info pública de la empresa prestadora */
  empresa: DatosEmpresaSyscom;

  /** Número de orden (folio) */
  numeroOrden: number;

  /** Fecha y hora de la orden */
  fecha: string;
  hora?: string | null;

  /** Nombre del cliente */
  nombreCliente: string;
  /** Nombre de la empresa del cliente, si aplica */
  empresaCliente?: string | null;
  /** Contacto del lado del cliente que atendió */
  contactoCliente?: string | null;

  /**
   * Actividad/tipo de servicio (descripción corta que el cliente entiende).
   * Ej. "Instalación Soft Restaurant"
   */
  tipoServicio: string;

  /**
   * Descripción de lo realizado, redactada para el cliente.
   * Sin jerga interna ni referencias a costos/pólizas.
   */
  descripcionServicioCliente: string;

  /**
   * Estado de la orden. Determina qué muestra la sección de cierre:
   * - 'finalizado' → muestra tipo de cierre realizado
   * - 'pendiente' | 'en proceso' → muestra leyenda "Aún estamos trabajando en ello"
   */
  estadoOrden: import('./index').EstadoOrden;

  /**
   * Tipo de cierre del servicio (póliza, garantía, cortesía).
   * Solo se muestra al cliente cuando estadoOrden === 'finalizado'.
   */
  tipoCierre?: TipoCierre | null;

  /**
   * Resolución del servicio, tomada del cierre.
   */
  resolucion?: string | null;

  /** Nombre del técnico que es responsable de la orden */
  tecnicoAtendio: string;

  /** Nombre del usuario que recibió/creó la orden */
  creadoPor: string;

  /** Fecha de impresión del documento */
  fechaImpresion?: string;

  /** Evaluación del cliente */
  evaluacion: EvaluacionCliente;

  /** Nombre y firma del cliente */
  nombreFirmaCliente?: string | null;
}
