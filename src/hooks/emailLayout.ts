interface LayoutParams {
  tituloInterno: string;
  cuerpoHtml: string;
  colorAcento?: string;
}

export function construirPlantillaBase({
  tituloInterno,
  cuerpoHtml,
  colorAcento = '#2563eb',
}: LayoutParams): string {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sys-Com</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f0f4f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08); max-width: 520px;">

            <tr>
              <td style="background-color: #1a2235; padding: 40px 30px; text-align: center; border-top: 4px solid ${colorAcento};">
                <h1 style="margin: 0; font-size: 28px; color: #ffffff; font-style: italic; font-weight: 700; letter-spacing: 1px;">Sys-Com</h1>
                <p style="margin: 5px 0 0 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Servicios y Sistemas en Computación</p>
              </td>
            </tr>

            <tr>
              <td style="padding: 40px 30px;">
                <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #1e293b;">${tituloInterno}</h2>
                ${cuerpoHtml}
              </td>
            </tr>

            <tr>
              <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #64748b;">
                  &copy; ${new Date().getFullYear()} Sys-Com. Todos los derechos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

export function bloqueDestacado(texto: string, colorAcento = '#2563eb'): string {
  return `
    <div style="background-color: #f8fafc; border-left: 4px solid ${colorAcento}; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 15px; color: #334155; line-height: 1.6;">${texto}</p>
    </div>
  `;
}

export function notaSecundaria(texto: string): string {
  return `
    <p style="margin: 30px 0 0 0; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
      ${texto}
    </p>
  `;
}

export function filaDato(etiqueta: string, valor: string): string {
  return `
    <tr>
      <td style="padding: 6px 10px 6px 0; font-size: 13px; color: #64748b; font-weight: 600; white-space: nowrap; vertical-align: top;">${etiqueta}</td>
      <td style="padding: 6px 0; font-size: 14px; color: #1e293b; font-weight: 500;">${valor}</td>
    </tr>
  `;
}

export function bloqueTexto(etiqueta: string, contenido: string): string {
  return `
    <div style="margin-bottom: 10px;">
      <div style="font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">
        ${etiqueta}
      </div>
      <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6; background-color: #f8fafc; padding: 12px 16px; border-radius: 8px;">
        ${contenido}
      </p>
    </div>
  `;
}
