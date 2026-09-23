import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import type { Usuario } from '../types';
import CredentialsChangedModal from '../../app/components/modals/CredentialsChangedModal';
import { estaOnline } from '../lib/conexion';
import { initMirrorSync } from '../lib/mirrorSync';
import { initSyncService } from '../lib/syncService';
import { localDb } from '../lib/localdb';
import { esModoDemo } from '../lib/entorno';

// Marca que usan las Edge Functions (update-auth-email / update-auth-password)
// al insertar la notificación de seguridad cuando un administrador cambia el
// correo o la contraseña de OTRO usuario. Ver fn_crear_notificacion.
const REF_SEGURIDAD_CREDENCIALES = 'seguridad_credenciales';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  perfil: Usuario | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  setOfflineSession: (offlineData: any) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  perfil: null,
  isLoading: true,
  signOut: async () => { },
  setOfflineSession: () => { },
});

export const useAuth = () => useContext(AuthContext);

// Tiempo mínimo entre dos verificaciones activas seguidas, para no llamar a
// getUser() en cada click si la persona navega muy rápido entre pantallas.
const INTERVALO_MINIMO_VERIFICACION_MS = 30 * 1000; // 30 segundos

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Mensaje del aviso de interrupción por cambio de credenciales. Si no es
  // null, se muestra el modal bloqueante y ya no importa lo que la persona
  // esté haciendo en ese momento.
  const [avisoCredenciales, setAvisoCredenciales] = useState<string | null>(null);

  const location = useLocation();
  const ultimaVerificacionRef = useRef(0);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Error al cerrar sesión en el servidor (posiblemente offline):', e);
    }
    // Eliminamos limpiarEspejoLocal() aquí para que si el usuario
    // se vuelve a loguear (incluso offline) pueda seguir viendo su información.
    // Limpiar sesión offline y datos temporales
    localStorage.removeItem('offline_session');
    localStorage.removeItem('temp_offline_hash');
    localStorage.removeItem('temp_offline_salt');
    
    // Forzar limpieza de tokens de Supabase por si la petición falló estando offline
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    }

    // Limpieza local de estados
    setSession(null);
    setUser(null);
    setPerfil(null);
    window.location.href = '/'; // Forzar redirección limpia al login
  }, []);

  const setOfflineSession = useCallback((offlineData: any) => {
    setSession({} as any);
    setUser({ id: offlineData.id, email: offlineData.email } as User);
    setPerfil(offlineData.perfil);
    setIsLoading(false);
  }, []);

  const fetchPerfil = useCallback(async (userId: string, email?: string) => {
    try {
      if (estaOnline()) {
        const { data, error } = await supabase
          .from('perfil_info')
          .select('*')
          .eq('auth_usuario', userId)
          .maybeSingle();

        if (!error && data) {
          // ✅ Siempre limpiar cualquier sesión offline residual cuando
          // logramos cargar el perfil real desde Supabase
          localStorage.removeItem('offline_session');
          
          setPerfil(data as Usuario);

          // Guardar credenciales offline si venimos del login
          const tempHash = localStorage.getItem('temp_offline_hash');
          const tempSalt = localStorage.getItem('temp_offline_salt');
          if (tempHash && tempSalt && email) {
            await localDb.offline_auth.put({
              email: email,
              user_id: userId,
              salt: tempSalt,
              password_hash: tempHash,
              perfil: data,
              last_login: new Date().toISOString()
            });
            localStorage.removeItem('temp_offline_hash');
            localStorage.removeItem('temp_offline_salt');
          }
          return;
        }
        console.warn('Error fetching perfil online, intentando con espejo local:', error);
      }

      // Sin internet: buscar en el espejo local SOLO para el userId correcto.
      // IMPORTANTE: NO caer aquí si hay internet — podría servir datos stale
      // de otro usuario que inició sesión antes en esta máquina.
      const local = await localDb.perfil_info.where('auth_usuario').equals(userId).first();
      if (local) {
        setPerfil(local as Usuario);
      } else {
        // Sin datos locales para este usuario — no mostrar perfil ajeno
        console.warn('Sin perfil local para userId:', userId);
        setPerfil(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- REVALIDACIÓN ACTIVA CONTRA EL SERVIDOR ---
  // onAuthStateChange (más abajo) solo detecta cambios que pasan EN ESTA MISMA
  // pestaña/dispositivo. Si un admin cambia el correo/contraseña de este usuario
  // desde OTRO dispositivo, aquí nunca se dispara ese evento — el access_token
  // local sigue "viéndose" válido hasta que expira solo (hasta 1h).
  //
  // Por eso preguntamos directo al servidor con getUser() -- a diferencia de
  // getSession(), este SÍ valida el token contra Supabase Auth en vez de solo
  // leer lo que hay guardado localmente. Si el servidor dice que ya no es
  // válido (porque se revocó la sesión o cambiaron las credenciales), cerramos
  // sesión localmente también.
  const verificarSesionActiva = useCallback(async (forzar = false) => {
    const ahora = Date.now();
    if (!forzar && ahora - ultimaVerificacionRef.current < INTERVALO_MINIMO_VERIFICACION_MS) {
      return; // ya se verificó hace poco, no saturar con checks innecesarios
    }

    // Sin internet no hay forma de preguntarle al servidor si el token sigue
    // siendo válido. Eso NO significa que la sesión sea inválida — significa
    // que no podemos saberlo ahora mismo. Nos quedamos con la sesión local
    // (ya persistida por supabase-js) y reintentamos cuando vuelva la red.
    if (!estaOnline()) return;

    ultimaVerificacionRef.current = ahora;

    // En modo demo, no cerramos la sesión simulada por comprobación del servidor
    if (esModoDemo()) return;

    const { data: { session: sesionLocal } } = await supabase.auth.getSession();
    if (!sesionLocal) return; // ya no hay sesión local, nada que verificar

    try {
      const { data: { user: usuarioValido }, error } = await supabase.auth.getUser();
      if (error || !usuarioValido) {
        console.warn('Sesión ya no es válida en el servidor, cerrando sesión local.');
        signOut();
      }
    } catch (err) {
      // Fallo de red a mitad de la llamada (se veía online pero la petición
      // no llegó): no es evidencia de que el token sea inválido, así que no
      // cerramos sesión por esto.
      console.warn('No se pudo verificar la sesión contra el servidor (¿sin red?):', err);
    }
  }, [signOut]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Si NO hay sesión real de Supabase pero sí hay una sesión offline
      // guardada, cargarla sin importar estaOnline(). Esto resuelve la
      // condición de carrera donde navigator.onLine devuelve true al arrancar
      // aunque no haya internet real (especialmente en Tauri/exe).
      const offlineSessionStr = localStorage.getItem('offline_session');
      if (!session && offlineSessionStr) {
        try {
          const offlineData = JSON.parse(offlineSessionStr);
          setSession({} as any);
          setUser({ id: offlineData.id, email: offlineData.email } as User);
          setPerfil(offlineData.perfil);
          setIsLoading(false);
          return;
        } catch (e) {
          // JSON inválido, limpiar y seguir con flujo normal
          localStorage.removeItem('offline_session');
        }
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchPerfil(session.user.id, session.user.email);
      else setIsLoading(false);
    });

    if (esModoDemo()) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // --- LÓGICA DE SEGURIDAD AGREGADA ---
      // Si el usuario es actualizado (ej. cambio de password) o la sesión se vuelve inválida
      if (event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        console.warn("Evento de seguridad detectado:", event);
        signOut();
        return;
      }
      // ------------------------------------

      // Prevenir que Supabase borre la sesión offline si dispara un evento vacío
      // SOLO ignorar si seguimos sin internet; si ya hay conexión y Supabase
      // dispara un evento vacío, significa logout real (ej. token expirado).
      const offlineSessionStr = localStorage.getItem('offline_session');
      if (offlineSessionStr && !session && !estaOnline()) {
        // Seguimos offline con sesión mockeada — no procesar evento vacío de Supabase
        return;
      }

      // Si hay sesión real online, limpiar offline_session para evitar bloqueos futuros
      if (session && offlineSessionStr) {
        localStorage.removeItem('offline_session');
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchPerfil(session.user.id, session.user.email);
      } else {
        // Solo limpiar perfil si realmente no hay sesión offline activa
        const stillOffline = localStorage.getItem('offline_session');
        if (!stillOffline) {
          setPerfil(null);
        }
        setIsLoading(false);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') verificarSesionActiva();
    };
    const handleFocus = () => verificarSesionActiva();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // --- INTERRUPCIÓN INMEDIATA POR CAMBIO DE CREDENCIALES (REALTIME) ---
    // Lo anterior (getUser(), visibilitychange, focus, intervalo de 5 min)
    // solo revalida cuando el navegador vuelve a tener foco/visibilidad o
    // cuando se navega de pantalla — si la persona se queda quieta
    // interactuando dentro de la misma vista, puede tardar hasta 5 minutos
    // en enterarse. RealtimeProvider mantiene un canal de WebSocket abierto
    // sin importar el foco de la pestaña, y ya escucha la tabla
    // `notificaciones` (filtrada por RLS a solo las del propio usuario),
    // reemitiéndola como el evento global 'data-changed'. Cuando un admin
    // cambia el correo o la contraseña de este usuario desde otro
    // dispositivo, las Edge Functions insertan ahí una notificación marcada
    // con tabla_referencia = 'seguridad_credenciales' — apenas llega,
    // interrumpimos con un modal bloqueante y forzamos el cierre de sesión,
    // esté la persona interactuando con la app o no.
    const handleDataChanged = (e: Event) => {
      const { tabla, event, new: nuevo } = (e as CustomEvent).detail ?? {};
      if (
        tabla === 'notificaciones' &&
        event === 'INSERT' &&
        nuevo?.tabla_referencia === REF_SEGURIDAD_CREDENCIALES
      ) {
        setAvisoCredenciales(
          typeof nuevo.descripcion === 'string' && nuevo.descripcion.length > 0
            ? nuevo.descripcion
            : 'Un administrador modificó tus credenciales de acceso. Por seguridad, tu sesión se cerrará.'
        );
      }
    };
    window.addEventListener('data-changed', handleDataChanged);

    // Además, por si la pestaña se queda abierta y visible mucho tiempo sin
    // cambiar de foco ni navegar, revisamos cada 5 minutos como red de seguridad.
    const intervalo = setInterval(() => verificarSesionActiva(true), 5 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('data-changed', handleDataChanged);
      clearInterval(intervalo);
    };
  }, [fetchPerfil, signOut, verificarSesionActiva]);

  useEffect(() => {
    verificarSesionActiva();
  }, [location.pathname, verificarSesionActiva]);

  // --- ESCUCHA DE CAMBIOS DE ROL ---
  // Si el rol del usuario cambia en la base de datos (por un admin),
  // forzamos el cierre de sesión para que al volver a entrar
  // se recarguen los permisos correctamente.
  useEffect(() => {
    if (!perfil) return;

    const handleRoleChange = (e: Event) => {
      const { tabla, event, new: nuevo } = (e as CustomEvent).detail ?? {};
      if (
        tabla === 'perfil_info' &&
        event === 'UPDATE' &&
        nuevo?.id_perfil_info === perfil.id_perfil_info &&
        nuevo?.rol !== perfil.rol
      ) {
        console.warn("Cambio de rol detectado, forzando cierre de sesión.");
        setAvisoCredenciales("Tu rol en el sistema ha sido actualizado. Por seguridad, tu sesión se cerrará para aplicar los nuevos permisos.");
      }
    };

    window.addEventListener('data-changed', handleRoleChange);
    return () => {
      window.removeEventListener('data-changed', handleRoleChange);
    };
  }, [perfil]);

  // Arranca el espejo local (mirrorSync) y la cola de escritura (syncService)
  // en cuanto hay sesión — no antes, porque sin usuario las políticas RLS de
  // Supabase no dejan traer nada de todas formas. En web ambas funciones no
  // hacen nada (ver esDesktop() dentro de cada una), así que esto es seguro
  // de dejar siempre montado sin importar la plataforma.
  // OJO: la condición es session?.access_token, NO "hay un user". Durante
  // una sesión offline (setOfflineSession) sí hay un `user` (uno "de
  // mentiras" armado con el email/id cacheados), pero `session` queda como
  // un objeto vacío -- nunca hubo un supabase.auth.setSession() real. Si
  // este efecto dependiera solo de `user`, en cuanto volviera la conexión
  // se dispararía hydrateAll()/syncQueue() usando un cliente de Supabase
  // SIN token válido, antes de que el usuario alcance a confirmar su
  // contraseña en OfflineSyncModal. Con access_token como condición, el
  // mirror/sync se queda quieto durante la sesión offline y arranca solo
  // hasta que haya una sesión real (ya sea porque nunca se perdió, o
  // porque el usuario la acaba de re-confirmar en el modal).
  const tieneSesionReal = !!session?.access_token;

  useEffect(() => {
    if (!tieneSesionReal) return;

    const desconectarMirror = initMirrorSync();
    const desconectarSync = initSyncService();

    return () => {
      desconectarMirror();
      desconectarSync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieneSesionReal]);

  return (
    <AuthContext.Provider value={{ session, user, perfil, isLoading, signOut, setOfflineSession }}>
      {children}
      <CredentialsChangedModal
        isOpen={avisoCredenciales !== null}
        mensaje={avisoCredenciales ?? ''}
        onSignOut={signOut}
      />
    </AuthContext.Provider>
  );
};