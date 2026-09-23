import { enqueueOperacion } from '../lib/syncService';
import { getOrdenById, updateOrden } from './ordenes.service';

/**
 * Reasigna el técnico responsable de una orden.
 * Requiere una nota de traspaso que se guardará en el historial.
 */
export const reasignarResponsable = async (
  idOrden: string,
  tecnicoActual: string | null,
  nuevoTecnico: string,
  notaTraspaso: string,
  realizadoPor: string
): Promise<{ success: boolean; error?: string }> => {
  if (!nuevoTecnico || nuevoTecnico === tecnicoActual) {
    return { success: false, error: 'Debe seleccionar un técnico distinto al actual.' };
  }
  if (!notaTraspaso.trim()) {
    return { success: false, error: 'La nota de traspaso es obligatoria.' };
  }

  const orden = await getOrdenById(idOrden);
  if (!orden) return { success: false, error: 'No se encontró la orden.' };

  // 1. Reasignar en orden_servicio
  const res = await updateOrden(
    idOrden,
    { responsable: nuevoTecnico },
    { responsable: tecnicoActual },
    'Reasignación de orden'
  );
  if (!res.success) return res;

  // 2. Insertar en orden_nota vía la cola (con fallback local si no hay red)
  try {
    await enqueueOperacion({
      operacion: 'insert',
      tabla_destino: 'orden_nota',
      realizado_por: realizadoPor,
      payload: {
        id_orden_servicio: idOrden,
        tipo: 'traspaso',
        nota: notaTraspaso.trim(),
        responsable_antes: tecnicoActual || null,
        responsable_despues: nuevoTecnico,
      },
    });
  } catch (err) {
    console.error('Error agregando nota de traspaso:', err);
  }

  return { success: true };
};

/**
 * Agrega técnicos de apoyo a una orden.
 * Requiere una nota que se guardará en el historial como 'apoyo'.
 */
export const agregarApoyoOrden = async (
  idOrden: string,
  apoyos: { id_tecnico: string; rol_apoyo: string }[],
  notaApoyo: string,
  realizadoPor: string
): Promise<{ success: boolean; error?: string }> => {
  if (apoyos.length === 0) {
    return { success: false, error: 'Debe agregar al menos un técnico de apoyo.' };
  }
  if (!notaApoyo.trim()) {
    return { success: false, error: 'La nota es obligatoria al agregar apoyo.' };
  }

  const orden = await getOrdenById(idOrden);
  if (!orden) return { success: false, error: 'No se encontró la orden.' };

  // 1. Agregar apoyos en orden_apoyo
  for (const apoyo of apoyos) {
    try {
      await enqueueOperacion({
        operacion: 'insert',
        tabla_destino: 'orden_apoyo',
        realizado_por: realizadoPor,
        payload: {
          id_orden_servicio: idOrden,
          id_tecnico: apoyo.id_tecnico,
          notas: apoyo.rol_apoyo?.trim() || null,
        },
      });
    } catch (err: any) {
      console.error('Error agregando apoyo:', err);
      return { success: false, error: `No se pudo agregar el apoyo: ${err.message || ''}` };
    }
  }

  // 2. Insertar nota de apoyo en orden_nota vía la cola
  try {
    await enqueueOperacion({
      operacion: 'insert',
      tabla_destino: 'orden_nota',
      realizado_por: realizadoPor,
      payload: {
        id_orden_servicio: idOrden,
        tipo: 'apoyo',
        nota: notaApoyo.trim(),
      },
    });
  } catch (err) {
    console.error('Error agregando nota de apoyo:', err);
  }

  return { success: true };
};

/**
 * Elimina (desactiva) un técnico de apoyo de una orden.
 */
export const eliminarApoyo = async (
  idApoyo: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await enqueueOperacion({
      operacion: 'delete',
      tabla_destino: 'orden_apoyo',
      id_registro: idApoyo,
      payload: {},
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error eliminando apoyo:', err);
    return { success: false, error: err.message };
  }
};