import { supabase } from '../utils/supabase';

/**
 * ==========================================
 * LOGIN
 * ==========================================
 */

// Convierte los segundos que devuelve la Edge Function `login` en un
// mensaje legible ("2 minutos", "45 segundos"), para no mostrarle al
// usuario un genérico "intenta más tarde" cuando sí sabemos el tiempo
// exacto.
const formatearMensajeBloqueo = (retryAfterSeconds?: number): string => {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) {
    return 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.';
  }
  if (retryAfterSeconds < 60) {
    return `Demasiados intentos fallidos. Intenta de nuevo en ${retryAfterSeconds} segundos.`;
  }
  const minutos = Math.ceil(retryAfterSeconds / 60);
  return `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
};

/**
 * Login a través de la Edge Function `login` en vez de llamar a
 * supabase.auth.signInWithPassword() directo desde el navegador.
 *
 * Por qué: esa función centraliza, del lado servidor, el bloqueo por
 * intentos fallidos (por cuenta y por IP) y garantiza un tiempo de
 * respuesta mínimo constante -- algo que un `setTimeout` en el cliente
 * NO logra, porque cualquiera puede saltarse el frontend y pegarle
 * directo al API de Supabase. Ver comentarios en
 * supabase/functions/login/index.ts para el detalle.
 *
 * Si el login es exitoso, hidrata la sesión local del SDK de Supabase
 * con los tokens devueltos por la función (equivalente a lo que hace
 * signInWithPassword internamente).
 */
export const loginConProteccion = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('login', {
      body: { email, password },
    });

    if (error) {
      return { success: false, error: 'Ocurrió un error inesperado.', locked: false };
    }

    if (!data?.success) {
      const retryAfterSeconds = typeof data?.retry_after_seconds === 'number' ? data.retry_after_seconds : undefined;
      return {
        success: false,
        error: data?.locked ? formatearMensajeBloqueo(retryAfterSeconds) : (data?.error || 'Correo o contraseña incorrectos.'),
        locked: Boolean(data?.locked),
        retryAfterSeconds,
      };
    }

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (setSessionError) {
      return { success: false, error: 'Ocurrió un error inesperado.', locked: false };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión con el servidor.', locked: false };
  }
};

/**
 * ==========================================
 * GESTIÓN DE CONTRASEÑAS
 * ==========================================
 */

export const adminSendResetPassword = async (id_perfil_info: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('admin-reset-password-email', {
      body: {
        id_perfil_info,
        origin: window.location.origin
      }
    });

    if (error) return { success: false, error: error.message };
    if (data && data.success === false) return { success: false, error: data.error };

    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión con el servidor.' };
  }
};

export const adminUpdateUserPassword = async (auth_usuario_id: string, nueva_password: string) => {
 const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    console.error("No hay sesión activa");
    return { success: false, error: "No hay sesión activa" };
  }

  const { data, error } = await supabase.functions.invoke('update-auth-password', {
    body: { auth_usuario_id, nueva_password },
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    console.error('Error en Edge Function:', error);
    return { success: false, error: error.message };
  }
  
  return data; 
};

/**
 * Cambia la contraseña del usuario actualmente autenticado.
 * Disponible para cualquier rol (administrador, limitado, mínimo).
 */
export const changeOwnPassword = async (nueva_password: string) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { success: false, error: 'No hay sesión activa.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('change-own-password', {
      body: { nueva_password },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) return { success: false, error: error.message };
    if (data && data.success === false) return { success: false, error: data.error };

    return { success: true, message: data?.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión con el servidor.' };
  }
};

/**
 * ==========================================
 * GESTIÓN DE CORREOS ELECTRÓNICOS
 * ==========================================
 */
export const updateOwnEmail = async (newEmail: string) => {
  const { data, error } = await supabase.auth.updateUser({ 
    email: newEmail 
  });
  
  if (error) {
    console.error('Error al solicitar cambio de correo:', error);
    return { success: false, error: error.message };
  }
  return { success: true, data };
};

export const adminUpdateUserEmail = async (userId: string, nuevoCorreo: string) => {
  try {
    // Invocamos la Edge Function de Supabase llamada 'update-auth-email'
    const { data, error } = await supabase.functions.invoke('update-auth-email', {
      body: { 
        auth_usuario_id: userId,     
        nuevo_correo: nuevoCorreo    
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Si la Edge Function respondió con un catch { success: false, error: ... }
    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión con la Edge Function' };
  }
};  

/**
 * ==========================================
 * CREACIÓN DE CREDENCIALES (ADMINISTRADOR)
 * ==========================================
 */
export const adminAddUserCredentials = async (id_perfil_info: string, email: string, password: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('admin-add-credentials', {
      body: {
        id_perfil_info,
        email,
        password
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, data }; // Retorna { auth_usuario_id } exitosamente
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión con la Edge Function' };
  }
};