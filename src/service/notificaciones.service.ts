import { supabase } from '../utils/supabase';
import type { Notificacion } from '../types';

// =============================================================
// Servicio de Notificaciones
// =============================================================
// Las notificaciones se INSERTAN únicamente desde triggers en BD
// (ver migración 20260709120000_sistema_notificaciones.sql) — este
// service solo LEE y actualiza el estado (leída/completada/eliminada)
// de las notificaciones del usuario en sesión.
//
// "Eliminar" una notificación NUNCA borra la fila: solo marca
// is_deleted = true. Esto es intencional — el estado de "leída" y la
// fecha de creación real quedan persistidos en BD siempre, así una
// notificación vieja que ya viste jamás puede "revivir" como nueva
// (algo que sí pasaría con un borrado puramente local en el estado
// de React).
// =============================================================

const LIMITE_NOTIFICACIONES = 40;

export const getNotificaciones = async (
  idUsuario: string
): Promise<{ data: Notificacion[]; error?: string }> => {
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('id_usuario', idUsuario)
    .eq('is_deleted', false)
    .order('is_read', { ascending: true })
    .order('created', { ascending: false })
    .limit(LIMITE_NOTIFICACIONES);

  if (error) {
    console.error('Error cargando notificaciones:', error);
    return { data: [], error: error.message };
  }
  return { data: (data as Notificacion[]) ?? [] };
};

export const marcarNotificacionLeida = async (
  idNotificacion: string
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('notificaciones')
    .update({ is_read: true })
    .eq('id_notificacion', idNotificacion);

  if (error) {
    console.error('Error marcando notificación como leída:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const marcarNotificacionCompletada = async (
  idNotificacion: string
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('notificaciones')
    .update({ is_completed: true, is_read: true })
    .eq('id_notificacion', idNotificacion);

  if (error) {
    console.error('Error marcando notificación como cumplida:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const marcarTodasLeidas = async (
  idUsuario: string
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('notificaciones')
    .update({ is_read: true })
    .eq('id_usuario', idUsuario)
    .eq('is_read', false)
    .eq('is_deleted', false);

  if (error) {
    console.error('Error marcando todas las notificaciones como leídas:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

// Borrado suave: la notificación desaparece de la vista del usuario
// pero la fila se conserva en BD (auditoría / no puede "reaparecer").
export const eliminarNotificacion = async (
  idNotificacion: string
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('notificaciones')
    .update({ is_deleted: true })
    .eq('id_notificacion', idNotificacion);

  if (error) {
    console.error('Error eliminando notificación:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};
