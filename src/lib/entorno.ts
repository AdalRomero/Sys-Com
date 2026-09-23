/**
 * Único punto de verdad sobre "¿esto es el exe de escritorio o la web en Vercel?".
 *
 * Por qué una bandera de BUILD y no detección en runtime (window.__TAURI__,
 * window.process.versions.electron, etc.): así no importa si terminas usando
 * Tauri, Electron o cualquier otra cosa — solo hay que setear la variable de
 * entorno correcta en el script de build del exe y todo lo demás (localdb,
 * mirrorSync, syncService) sigue funcionando sin tocarlo de nuevo.
 *
 * CONFIGURACIÓN NECESARIA:
 *  - En tu .env normal (web / Vercel): no pongas la variable, o ponla en 'false'.
 *  - En el build del exe (ej. script "build:desktop" en package.json):
 *        VITE_ES_DESKTOP=true vite build
 *    o agrégala al .env que use ese build específico.
 */
export function esDesktop(): boolean {
  const flag = import.meta.env.VITE_ES_DESKTOP;
  if (flag === 'true' || flag === true) return true;

  // Respaldo por si el flag de build no se seteó pero sí estamos dentro
  // de un wrapper de escritorio conocido (no falla si no existe ninguno).
  if (typeof window !== 'undefined') {
    const w = window as unknown as {
      __TAURI__?: unknown;
      __TAURI_INTERNALS__?: unknown;
      process?: { versions?: { electron?: string } };
    };
    if (w.__TAURI__ || w.__TAURI_INTERNALS__ || w.process?.versions?.electron) {
      return true;
    }
  }

  return false;
}

/**
 * Indica si el sistema está ejecutándose en "Modo Demo" (público/portafolio),
 * lo que permite visualizar la aplicación saltándose el inicio de sesión.
 */
export function esModoDemo(): boolean {
  const flag = import.meta.env.VITE_MODO_DEMO;
  return flag === 'true' || flag === true;
}
