// Exporta arreglos de objetos a un .csv descargable. Excel lo abre
// nativamente, así que cubre el botón "Descargar Excel" sin necesitar
// una librería de generación de .xlsx.

type Fila = Record<string, string | number | null | undefined>;

const escaparCelda = (valor: string | number | null | undefined): string => {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n;]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
};

export interface SeccionCsv {
  titulo: string;
  columnas: { clave: string; etiqueta: string }[];
  filas: Fila[];
}

export const descargarCsvMultiseccion = (nombreArchivo: string, secciones: SeccionCsv[]) => {
  const lineas: string[] = [];

  secciones.forEach((seccion, idx) => {
    if (idx > 0) lineas.push('');
    lineas.push(escaparCelda(seccion.titulo));
    lineas.push(seccion.columnas.map((c) => escaparCelda(c.etiqueta)).join(','));
    if (seccion.filas.length === 0) {
      lineas.push(escaparCelda('Sin datos'));
    } else {
      seccion.filas.forEach((fila) => {
        lineas.push(seccion.columnas.map((c) => escaparCelda(fila[c.clave])).join(','));
      });
    }
  });

  // BOM para que Excel detecte UTF-8 correctamente (acentos, ñ, etc.)
  const contenido = '\uFEFF' + lineas.join('\n');
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
