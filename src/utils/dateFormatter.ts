export const formatFecha = (isoString: string | null | undefined, includeTime: boolean = false): string => {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Phoenix',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return date.toLocaleDateString('es-MX', options);
  } catch (e) {
    return '—';
  }
};

// Tiempo relativo estilo "Hace 5 min" / "Hace 2 h" / "Ayer" — usado en el
// panel de notificaciones para no mostrar siempre la fecha completa.
export const formatTiempoRelativo = (isoString: string | null | undefined): string => {
  if (!isoString) return '—';
  try {
    const fecha = new Date(isoString);
    const ahora = new Date();
    const segundos = Math.floor((ahora.getTime() - fecha.getTime()) / 1000);

    if (segundos < 5) return 'Justo ahora';
    if (segundos < 60) return `Hace ${segundos} s`;

    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `Hace ${minutos} min`;

    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas} h`;

    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'Ayer';
    if (dias < 7) return `Hace ${dias} días`;

    return formatFecha(isoString);
  } catch (e) {
    return '—';
  }
};
