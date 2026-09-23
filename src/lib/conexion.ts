import { esDesktop, esModoDemo } from './entorno';

const INTERVALO_PING_MS = 15_000;
const TIMEOUT_PING_MS = 5_000;

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();

// Arranca con lo que diga el navegador; el primer ping real lo corrige.
let online = navigator.onLine;

function notify() {
  listeners.forEach((cb) => cb(online));
}

function setEstado(nuevo: boolean) {
  if (nuevo === online) return;
  online = nuevo;
  notify();

  // Si acaba de regresar el internet, recargar la página para refrescar datos
  if (online === true) {
    console.log("Internet restaurado, recargando página...");
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }
}

/**
 * navigator.onLine SOLO dice si hay una interfaz de red activa (wifi
 * conectado a un router). NO dice si ese wifi tiene salida a internet de
 * verdad. Por eso, además de escuchar los eventos del navegador, se
 * confirma pegándole directo al backend de Supabase.
 */
async function verificarConexionReal(): Promise<boolean> {
  if (!navigator.onLine) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_PING_MS);

  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    // Supabase exige el header 'apikey' incluso en /auth/v1/health.
    // Sin esto responde 401 y el chequeo siempre da "offline" aunque sí haya red.
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { apikey: anonKey },
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function chequear() {
  // En la web el "online real" no cambia nada (siempre necesitas internet
  // para usarla), así que ahí basta con lo que diga el navegador y nos
  // ahorramos pegarle a Supabase cada 15s sin necesidad.
  if (!esDesktop()) {
    setEstado(navigator.onLine);
    return;
  }
  setEstado(await verificarConexionReal());
}

let iniciado = false;
function iniciarMonitor() {
  if (iniciado) return;
  iniciado = true;

  window.addEventListener('online', () => void chequear());
  window.addEventListener('offline', () => setEstado(false));

  if (esDesktop()) {
    setInterval(() => void chequear(), INTERVALO_PING_MS);
  }
  void chequear(); // primer chequeo al cargar
}

iniciarMonitor();

/**
 * ── LA LÍNEA DE DECISIÓN ──
 * Único punto de verdad de toda la app sobre "¿hay internet de verdad?".
 * `syncService.ts` la usa para decidir si escribe directo en Supabase o
 * cae al buzón local. `mirrorSync.ts` la usa para saber cuándo volver a
 * traer todo tras un corte. Los componentes la usan (vía useConexion) para
 * mostrar el indicador de estado.
 */
export function estaOnline(): boolean {
  if (esModoDemo()) return false;
  return online;
}

/** Para código fuera de React (syncService, mirrorSync) que reacciona a cambios */
export function onConexionChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Fuerza un chequeo inmediato — útil para un botón "reintentar conexión" */
export async function forzarChequeoConexion(): Promise<boolean> {
  await chequear();
  return online;
}