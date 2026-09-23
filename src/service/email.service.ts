import { supabase } from '../utils/supabase';

export interface EnviarCorreoParams {
  destino: string | string[];
  asunto: string;
  mensaje: string;
}

export interface EnviarCorreoResultado {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export async function enviarCorreo({
  destino,
  asunto,
  mensaje,
}: EnviarCorreoParams): Promise<EnviarCorreoResultado> {
  const destinatarios = Array.isArray(destino) ? destino.filter(Boolean) : [destino].filter(Boolean);

  if (destinatarios.length === 0 || !asunto || !mensaje) {
    return { ok: false, error: 'Faltan campos requeridos (destino, asunto, mensaje)' };
  }

  const { data, error } = await supabase.functions.invoke('enviar-correo', {
    body: { destino: destinatarios, asunto, mensaje },
  });

  if (error) {
    console.error('Error al enviar correo:', error);
    return { ok: false, error: error.message };
  }

  return { ok: true, data };
}
