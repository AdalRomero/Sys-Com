import { supabase } from '../utils/supabase';

export interface PeticionQueueServidor {
  id_peticion: string;
  operacion: 'insert' | 'update' | 'correccion' | 'delete' | 'aprobar';
  tabla_destino: string;
  id_registro: string | null;
  payload: Record<string, unknown>;
  estado: 'pendiente' | 'procesando' | 'completado' | 'fallido' | 'conflicto' | 'descartado';
  error_detalle: string | null;
  intentos: number;
  max_intentos: number;
  realizado_por: string | null;
  created: string;
  procesado_at: string | null;
  datos_conflicto: {
    db_actual: Record<string, unknown>;
    tu_payload: Record<string, unknown>;
    columnas_chocan: string[];
  } | null;
}

export const getPeticionDetalle = async (
  idPeticion: string
): Promise<PeticionQueueServidor | null> => {
  const { data, error } = await supabase
    .from('peticion_queue')
    .select('*')
    .eq('id_peticion', idPeticion)
    .single();

  if (error) {
    console.error('Error obteniendo detalle de petición:', error);
    return null;
  }
  return data as PeticionQueueServidor;
};

export const resolverConflicto = async (
  idPeticion: string,
  elecciones: Record<string, 'local' | 'servidor'>
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.rpc('fn_resolver_conflicto', {
    p_id_peticion: idPeticion,
    p_elecciones: elecciones,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const reintentarPeticionFallida = async (
  idPeticion: string,
  payloadCorregido?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.rpc('fn_reintentar_peticion_fallida', {
    p_id_peticion: idPeticion,
    p_payload_corregido: payloadCorregido ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const descartarPeticion = async (
  idPeticion: string
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.rpc('fn_descartar_peticion', {
    p_id_peticion: idPeticion,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
};