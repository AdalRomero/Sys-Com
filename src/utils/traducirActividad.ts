// =============================================================
// traducirActividad
// =============================================================

export interface CambioCampo {
  etiqueta: string;
  antes?: string;
  despues?: string;
}

export interface ActividadTraducida {
  encabezado: string;
  cambios: CambioCampo[];
}

export interface MapasActividad {
  usuarios: Map<string, string>;
  clientes: Map<string, string>;
  empresas: Map<string, string>;
  ordenes: Map<string, number>; // id_orden_servicio -> numero_orden
}

export const mapasVacios: MapasActividad = {
  usuarios: new Map(),
  clientes: new Map(),
  empresas: new Map(),
  ordenes: new Map(),
};

// ── Etiquetas de rol (mismas que usa el resto de Usuarios) ──────────
const ROL_LABELS: Record<string, string> = {
  administrador: 'Administrador',
  limitado: 'Limitado',
  minimo: 'Mínimo',
};

const TIPO_NOTA_LABELS: Record<string, string> = {
  traspaso: 'Traspaso de técnico',
  apoyo: 'Apoyo',
  observacion: 'Observación',
  cierre: 'Cierre',
};

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  'en proceso': 'En proceso',
  finalizado: 'Finalizado',
};

const PRIORIDAD_LABELS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alto: 'Alta',
  urgente: 'Urgente',
};

const ACTIVIDAD_LABELS: Record<string, string> = {
  remoto: 'Remoto',
  oficina: 'Oficina',
  domicilio: 'Domicilio',
};

const val = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
};

// Construye la lista de cambios campo por campo para un UPDATE, usando
// una tabla de traducción { columna: { etiqueta, traducir? } }. Solo
// incluye los campos que de verdad cambiaron (según campos_cambios) y
// que tienen una traducción definida — así nunca se cuela una columna
// técnica (search_vector, version, es_actual, etc.) sin querer.
type ReglaCampo = { etiqueta: string; traducir?: (v: any, maps: MapasActividad) => string };

const construirCambios = (
  entry: any,
  reglas: Record<string, ReglaCampo>,
  maps: MapasActividad
): CambioCampo[] => {
  const antes = entry.datos_antes ?? {};
  const despues = entry.datos_despues ?? {};
  const campos: string[] = entry.campos_cambios ?? [];

  const resultado: CambioCampo[] = [];
  for (const campo of campos) {
    const regla = reglas[campo];
    if (!regla) continue; // columna técnica sin traducción -> se ignora
    if (antes[campo] === despues[campo]) continue;

    const traducir = regla.traducir ?? ((v: any) => val(v));
    resultado.push({
      etiqueta: regla.etiqueta,
      antes: traducir(antes[campo], maps),
      despues: traducir(despues[campo], maps),
    });
  }
  return resultado;
};

const nombreUsuario = (id: string | null | undefined, maps: MapasActividad, fallback: string) =>
  id ? (maps.usuarios.get(id) ?? 'un usuario ya no disponible') : fallback;

const nombreCliente = (id: string | null | undefined, maps: MapasActividad, fallback: string) =>
  id ? (maps.clientes.get(id) ?? 'un cliente ya no disponible') : fallback;

const nombreOrden = (idOrden: string | null | undefined, maps: MapasActividad) => {
  const numero = idOrden ? maps.ordenes.get(idOrden) : undefined;
  return numero ? `la orden #${numero}` : 'una orden de servicio';
};

// ── Reglas de campo por tabla ───────────────────────────────────────

const reglasPerfilInfo: Record<string, ReglaCampo> = {
  nombres: { etiqueta: 'Nombre(s)' },
  apellido_paterno: { etiqueta: 'Apellido Paterno' },
  apellido_materno: { etiqueta: 'Apellido Materno' },
  usuario: { etiqueta: 'Nombre de Usuario' },
  rol: { etiqueta: 'Rol', traducir: (v) => ROL_LABELS[v] ?? val(v) },
};

const reglasContacto: Record<string, ReglaCampo> = {
  correo_personal: { etiqueta: 'Correo Personal' },
  lada: { etiqueta: 'Lada' },
  telefono: { etiqueta: 'Teléfono' },
  direccion: { etiqueta: 'Dirección' },
};

const reglasClientesEmpresa: Record<string, ReglaCampo> = {
  nombre: { etiqueta: 'Nombre' },
  direccion: { etiqueta: 'Dirección' },
  correo: { etiqueta: 'Correo' },
  lada: { etiqueta: 'Lada' },
  telefono: { etiqueta: 'Teléfono' },
  id_empresa: {
    etiqueta: 'Empresa',
    traducir: (v, maps) => (v ? (maps.empresas.get(v) ?? 'una empresa ya no disponible') : 'Sin empresa'),
  },
};

const reglasOrdenServicio: Record<string, ReglaCampo> = {
  estado: { etiqueta: 'Estado', traducir: (v) => ESTADO_LABELS[v] ?? val(v) },
  prioridad: { etiqueta: 'Prioridad', traducir: (v) => PRIORIDAD_LABELS[v] ?? val(v) },
  actividad: { etiqueta: 'Tipo de Actividad', traducir: (v) => ACTIVIDAD_LABELS[v] ?? val(v) },
  equipo: { etiqueta: 'Equipo' },
  problema: { etiqueta: 'Problema' },
  observaciones: { etiqueta: 'Observaciones' },
  responsable: {
    etiqueta: 'Técnico Responsable',
    traducir: (v, maps) => nombreUsuario(v, maps, 'Sin asignar'),
  },
  id_clientes: {
    etiqueta: 'Cliente',
    traducir: (v, maps) => nombreCliente(v, maps, 'Sin cliente'),
  },
};

// ── Traductor principal ─────────────────────────────────────────────

export const traducirActividad = (
  entry: any,
  maps: MapasActividad = mapasVacios
): ActividadTraducida | null => {
  const antes = entry.datos_antes ?? {};
  const despues = entry.datos_despues ?? {};
  const campos: string[] = entry.campos_cambios ?? [];

  switch (entry.tabla) {
    // ── Perfil de un usuario ──────────────────────────────────────
    case 'perfil_info': {
      const nombre = nombreUsuario(entry.id_registro, maps, 'un usuario');
      if (entry.operacion === 'INSERT') return { encabezado: `Creó el perfil de ${nombre}`, cambios: [] };
      if (entry.operacion === 'DELETE') return { encabezado: `Eliminó el perfil de ${nombre}`, cambios: [] };

      // Cambio de acceso (auth_usuario) se traduce aparte: es un uuid interno.
      if (campos.includes('auth_usuario') && antes.auth_usuario !== despues.auth_usuario) {
        const otorgado = !antes.auth_usuario && !!despues.auth_usuario;
        return {
          encabezado: otorgado
            ? `Otorgó acceso al sistema a ${nombre}`
            : `Revocó el acceso al sistema a ${nombre}`,
          cambios: [],
        };
      }

      const cambios = construirCambios(entry, reglasPerfilInfo, maps);
      if (cambios.length === 0) return null; // solo cambió algo técnico (ej. last_update) -> se omite
      return { encabezado: `Modificó el perfil de ${nombre}`, cambios };
    }

    // ── Datos de contacto de un usuario ───────────────────────────
    case 'contacto': {
      const nombre = nombreUsuario(entry.id_registro, maps, 'un usuario');
      if (entry.operacion === 'INSERT') return { encabezado: `Registró los datos de contacto de ${nombre}`, cambios: [] };
      if (entry.operacion === 'DELETE') return { encabezado: `Eliminó los datos de contacto de ${nombre}`, cambios: [] };

      const cambios = construirCambios(entry, reglasContacto, maps);
      if (cambios.length === 0) return null;
      return { encabezado: `Modificó los datos de contacto de ${nombre}`, cambios };
    }

    // ── Clientes (versionados: INSERT también puede ser una nueva versión) ──
    case 'clientes': {
      const nombre = nombreCliente(entry.id_registro, maps, despues?.nombre ?? antes?.nombre ?? 'un cliente');

      if (entry.operacion === 'DELETE') return { encabezado: `Eliminó al cliente ${nombre}`, cambios: [] };

      if (entry.operacion === 'INSERT') {
        // version === 1 -> alta real. version > 1 -> nueva versión generada
        // por una edición "sin corrección" (no es una creación nueva).
        if ((despues?.version ?? 1) > 1) return null; // ruido interno de versionado
        return { encabezado: `Agregó al cliente ${nombre}`, cambios: [] };
      }

      // UPDATE: puede ser (a) una corrección real de datos, o (b) el
      // marcado interno "es_actual = false" que hace el versionado al
      // crear una nueva versión. Este segundo caso no le interesa al
      // usuario final, se omite.
      if (campos.every((c) => c === 'es_actual')) return null;

      const cambios = construirCambios(entry, reglasClientesEmpresa, maps);
      if (cambios.length === 0) return null;
      return { encabezado: `Corrigió los datos del cliente ${nombre}`, cambios };
    }

    // ── Empresas (mismo patrón de versionado que clientes) ────────
    case 'empresa': {
      const nombre = maps.empresas.get(entry.id_registro) ?? despues?.nombre ?? antes?.nombre ?? 'una empresa';

      if (entry.operacion === 'DELETE') return { encabezado: `Eliminó la empresa ${nombre}`, cambios: [] };

      if (entry.operacion === 'INSERT') {
        if ((despues?.version ?? 1) > 1) return null;
        return { encabezado: `Registró la empresa ${nombre}`, cambios: [] };
      }

      if (campos.every((c) => c === 'es_actual')) return null;

      const cambios = construirCambios(entry, reglasClientesEmpresa, maps);
      if (cambios.length === 0) return null;
      return { encabezado: `Corrigió los datos de la empresa ${nombre}`, cambios };
    }

    // ── Órdenes de servicio ────────────────────────────────────────
    case 'orden_servicio': {
      const numero = despues?.numero_orden ?? antes?.numero_orden;
      const etiquetaOrden = numero ? `la orden #${numero}` : 'una orden de servicio';

      if (entry.operacion === 'INSERT') return { encabezado: `Creó ${etiquetaOrden}`, cambios: [] };
      if (entry.operacion === 'DELETE') return { encabezado: `Eliminó ${etiquetaOrden}`, cambios: [] };

      const cambios = construirCambios(entry, reglasOrdenServicio, maps);
      if (cambios.length === 0) return null;
      return { encabezado: `Actualizó ${etiquetaOrden}`, cambios };
    }

    // ── Cierre de una orden ────────────────────────────────────────
    case 'cierre_orden': {
      const etiquetaOrden = nombreOrden(despues?.id_orden_servicio ?? antes?.id_orden_servicio, maps);
      if (entry.operacion === 'DELETE') return { encabezado: `Eliminó el cierre de ${etiquetaOrden}`, cambios: [] };
      // INSERT o UPDATE (el trigger hace upsert): ambos significan "cerró/actualizó el cierre"
      const cerroDeNuevo = entry.operacion === 'UPDATE';
      return {
        encabezado: cerroDeNuevo
          ? `Actualizó el cierre de ${etiquetaOrden}`
          : `Cerró ${etiquetaOrden}`,
        cambios: [],
      };
    }

    // ── Apoyo (técnico de refuerzo) asignado a una orden ──────────
    case 'orden_apoyo': {
      const etiquetaOrden = nombreOrden(despues?.id_orden_servicio ?? antes?.id_orden_servicio, maps);
      const tecnico = nombreUsuario(despues?.id_tecnico ?? antes?.id_tecnico, maps, 'un técnico');

      if (entry.operacion === 'DELETE') return { encabezado: `Quitó a ${tecnico} como apoyo de ${etiquetaOrden}`, cambios: [] };
      if (entry.operacion === 'INSERT') return { encabezado: `Agregó a ${tecnico} como apoyo en ${etiquetaOrden}`, cambios: [] };
      return { encabezado: `Actualizó el apoyo de ${tecnico} en ${etiquetaOrden}`, cambios: [] };
    }

    // ── Notas de una orden (inmutables: normalmente solo INSERT) ──
    case 'orden_nota': {
      const etiquetaOrden = nombreOrden(despues?.id_orden_servicio ?? antes?.id_orden_servicio, maps);
      const tipo = TIPO_NOTA_LABELS[despues?.tipo] ?? 'Nota';
      return { encabezado: `Agregó una nota (${tipo}) en ${etiquetaOrden}`, cambios: [] };
    }

    default:
      // Tabla auditada que aún no tiene traducción específica: se
      // muestra algo genérico en vez de esconder la actividad.
      return { encabezado: `Realizó una acción en «${entry.tabla}»`, cambios: [] };
  }
};
