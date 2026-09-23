import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,        // Guarda la sesión en localStorage
    autoRefreshToken: true,      // Refresca el token automáticamente
    detectSessionInUrl: true,    // Vital para el flujo de recuperación de contraseña
    storageKey: 'sb-auth-token', // Nombre de la key en localStorage
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
