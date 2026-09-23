// =============================================
// Syscom — Tipos TypeScript Compartidos
// =============================================

export type EstadoOrden = 'pendiente' | 'en proceso' | 'finalizado';
export type Prioridad = 'baja' | 'media' | 'alto' | 'urgente';
export type TipoActividad = 'remoto' | 'oficina' | 'domicilio';
// Roles según BD: rol_usuario ENUM = administrador, limitado, minimo
export type RolUsuario = 'administrador' | 'limitado' | 'minimo';
export type EstadoUsuario = 'Activo' | 'Inactivo';

// ==========================================
// Autenticación Offline (BD Local: offline_auth)
// ==========================================
export interface OfflineAuthRecord {
  email: string;
  user_id: string;
  salt: string;        // aleatoria, generada localmente por usuario
  password_hash: string; // PBKDF2(password, salt, 200,000 iter)
  perfil: any; // O Usuario si aplica
  last_login: string; // timestamp (ISO string) del último login online
}

// ==========================================
// Empresa (BD: public.empresa)
// ==========================================
export interface Empresa {
  id_empresa: string;
  nombre: string;
  direccion?: string | null;
  correo?: string | null;
  lada?: string | null;
  telefono?: string | null;
  id_raiz?: string | null;
  version?: number;
  es_actual?: boolean;
  es_correccion?: boolean;
  motivo_cambio?: string | null;
  editado_por?: string | null;
  created?: string;
  last_update?: string;
}

// ==========================================
// Cliente (BD: public.clientes) — unificado
// ==========================================
export interface Cliente {
  id_cliente: string;
  id_empresa?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  correo?: string | null;
  lada?: string | null;
  telefono?: string | null;
  id_raiz?: string | null;
  version?: number;
  es_actual?: boolean;
  es_correccion?: boolean;
  motivo_cambio?: string | null;
  editado_por?: string | null;
  activo?: boolean;
  created?: string;
  last_update?: string;

  // Join resuelto (cuando se hace select('*, empresa(*)'))
  empresa?: Empresa | null;
}

export interface Orden {
  id_orden_servicio: string;
  numero_orden: number;
  realizado_por?: string | null;
  created: string;
  prioridad: Prioridad;
  actividad: TipoActividad;
  estado: EstadoOrden;
  equipo: string | null;
  problema: string | null;
  observaciones: string | null;
  finalized_at?: string | null;
  last_update?: string;

  // FK raw
  id_clientes?: string | null;
  responsable?: string | null;

  // Joins resueltos
  cliente?: Cliente | null;
  cierre_orden?: { observaciones_finales?: string | null }[] | { observaciones_finales?: string | null } | null;
  responsable_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string;
    usuario: string;
  } | null;
  realizado_por_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string;
    usuario: string;
  } | null;

  // Legado — algunos componentes viejos pueden seguir leyendo esto,
  // úsalos solo como fallback mientras migras las vistas.
  cliente_nombre?: string | null;
}

export interface HistorialEntry {
  fecha: string;
  hora: string;
  descripcion: string;
  usuario: string;
  tipo: 'creacion' | 'asignacion' | 'actualizacion' | 'cierre' | 'nota';
}

// Perfil_info + Contacto (BD)
export interface Usuario {
  id_perfil_info: string;
  auth_usuario: string | null;
  usuario: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  rol: RolUsuario;
  contacto?: {
    lada?: string;
    telefono?: string;
    direccion?: string;
    correo_personal?: string;
  };
}

export type TipoNotificacion = 'info' | 'warning' | 'alert' | 'success';

// ==========================================
// Notificaciones (BD: public.notificaciones)
// ==========================================
export interface Notificacion {
  id_notificacion: string;
  id_usuario: string;
  titulo: string;
  descripcion: string;
  tipo: TipoNotificacion;
  // prioridad reusa el mismo enum que las ordenes (baja/media/alto/urgente);
  // puede venir null cuando la notificacion no esta ligada a una prioridad
  // (p.ej. cambio de datos de contacto).
  prioridad: Prioridad | null;
  tabla_referencia: string | null;
  id_referencia: string | null;
  is_read: boolean;
  is_completed: boolean;
  is_deleted: boolean;
  created: string;
  last_update: string;
}

export interface ActividadReciente {
  id: string;
  folio: string;
  descripcion: string;
  tiempo: string;
  estado: EstadoOrden | 'Urgente';
  tipo: 'info' | 'urgente' | 'completada';
}

export interface DatoGrafica {
  label: string;
  valor: number;
}

export interface FiltrosOrden {
  busqueda: string;
  estado: string;
  tecnico: string;
  fecha: string;
}

export interface OrdenFinalizada extends Orden {
  id_orden_servicio: string;
  numero_orden: number;
  equipo: string | null;
  prioridad: Prioridad;
  responsable: string | null;
  estado: EstadoOrden;
  finalized_at: string | null; 
  cliente_nombre: string | null;
  responsable_nombre: string | null;
}

// ==========================================
// Apoyo de Orden (BD: public.orden_apoyo)
// ==========================================
export interface AsignacionApoyo {
  id_apoyo: string;
  id_orden_servicio: string;
  id_tecnico: string;
  notas?: string | null;
  realizado_por?: string | null;
  created: string;
  last_update?: string;

  tecnico_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
  } | null;
  realizado_por_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
  } | null;
}

// Alias para compatibilidad — el historial de asignaciones ahora viene de orden_apoyo
export type AsignacionOrden = AsignacionApoyo;

// ==========================================
// Notas de Orden (BD: public.orden_nota)
// ==========================================
export type TipoNota = 'traspaso' | 'apoyo' | 'observacion' | 'cierre';

export interface OrdenNota {
  id_nota: string;
  id_orden_servicio: string;
  tipo: TipoNota;
  nota: string;
  responsable_antes?: string | null;
  responsable_despues?: string | null;
  realizado_por?: string | null;
  created: string;

  realizado_por_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
  } | null;
  responsable_antes_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
  } | null;
  responsable_despues_perfil?: {
    id_perfil_info: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
  } | null;
}