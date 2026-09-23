import type { DocumentoOrdenCliente } from '../../src/types/documentos';

interface Props {
  datos: DocumentoOrdenCliente;
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}



function RadioCheck({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span style={{ marginRight: 14, fontSize: 11 }}>
      [ {checked ? '✓' : ' '} ] {label}
    </span>
  );
}

const ETIQUETA_CIERRE: Record<string, string> = {
  poliza: 'Servicio cubierto por Póliza',
  garantia: 'Servicio en Garantía',
  cortesia: 'Servicio de Cortesía',
};

export default function OrdenClienteDocument({ datos }: Props) {

  const {
    empresa,
    numeroOrden,
    nombreCliente,
    empresaCliente,
    contactoCliente,
    tipoServicio,
    descripcionServicioCliente,
    estadoOrden,
    tipoCierre,
    tecnicoAtendio,
    creadoPor,
    evaluacion,
    nombreFirmaCliente,
    fecha,
    hora,
  } = datos;

  const finalizado = estadoOrden === 'finalizado';

  // Fecha/hora en que se generó/imprimió este documento (igual que en OrdenInternaDocument)
  const ahoraISO = new Date().toISOString();
  const fechaImpresionCalculada = formatFecha(ahoraISO);
  const horaImpresionCalculada = formatHora(ahoraISO);

  return (
    <div
      id="orden-cliente"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: 12,
        color: '#000',
        background: '#fff',
        width: 800,
        margin: '0 auto',
        padding: '24px 32px',
        border: '1px solid #ccc',
        boxSizing: 'border-box',
      }}
    >
      {/* ─── ENCABEZADO ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        {/* Logo */}
        <div style={{ width: '35%', display: 'flex', alignItems: 'center' }}>
          <img
            src={`${window.location.origin}/assets/syscom-logo-azul.svg`}
            alt="Logo Syscom"
            style={{ height: 130, width: 'auto' }}
          />
        </div>

        {/* Info empresa centro */}
        <div style={{ width: '35%', fontSize: 10, textAlign: 'center' }}>
          <div style={{ fontWeight: 'bold' }}>{empresa.responsable}</div>
          <div>{empresa.email}</div>
          <div>{empresa.direccion}</div>
          <div>
            Tel. {empresa.telefono}
            {empresa.fax ? ` · Fax ${empresa.fax}` : ''}
          </div>
          <div>
            RFC: {empresa.rfc} &nbsp; C.P. {empresa.codigoPostal}
          </div>
        </div>

        {/* Folio + fecha de impresión */}
        <div style={{ width: '25%', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#666' }}>{fechaImpresionCalculada}</div>
          <div style={{ fontSize: 10, color: '#666' }}>{horaImpresionCalculada}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 4 }}>
            Orden #{numeroOrden}
          </div>
        </div>
      </div>


      <hr style={{ borderTop: '2px solid #000', margin: '8px 0' }} />

      {/* ─── CLIENTE ────────────────────────────────────────── */}
      <table style={{ width: '100%', marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: '60%' }}>
              <div style={{ fontSize: 13, fontWeight: 'bold' }}>{nombreCliente}</div>
              {empresaCliente && (
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                  Empresa: {empresaCliente}
                </div>
              )}
              {contactoCliente && (
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                  Contacto: {contactoCliente}
                </div>
              )}
            </td>
            <td style={{ width: '40%', textAlign: 'right', fontSize: 11 }}>
              <div style={{ marginBottom: 4 }}>
                <strong> Atendido por:</strong> {creadoPor}
              </div>
              <div>
                <strong> Responsable:</strong> {tecnicoAtendio}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── TÍTULO ORDEN ───────────────────────────────────── */}
      <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 'bold', margin: '8px 0' }}>
        ORDEN DE SERVICIO
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#444', marginBottom: 10 }}>
        Creada el: {formatFecha(fecha)} a las {hora || formatHora(fecha)}
      </div>

      {/* ─── TIPO DE SERVICIO ───────────────────────────────── */}
      <div style={{ fontSize: 11, marginBottom: 10 }}>
        <strong>Actividad:</strong> {tipoServicio}
      </div>

      <hr style={{ borderTop: '1px solid #555', margin: '6px 0' }} />

      {/* ─── DESCRIPCIÓN + ESTADO DEL SERVICIO ──────────────── */}
      <table style={{ width: '100%', marginBottom: 10 }}>
        <tbody>
          <tr>
            {/* Descripción */}
            <td style={{ width: '55%', verticalAlign: 'top', paddingRight: 12 }}>
              <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>
                Descripción del servicio:
              </div>
              <div
                style={{
                  border: '1px solid #aaa',
                  minHeight: 80,
                  padding: 8,
                  fontSize: 12,
                }}
              >
                {descripcionServicioCliente}
              </div>
            </td>

            {/* Estado del servicio — lado derecho */}
            <td
              style={{
                width: '45%',
                verticalAlign: 'top',
                paddingLeft: 12,
                borderLeft: '1px solid #ccc',
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 8 }}>
                Estado del servicio:
              </div>
              {finalizado ? (
                /* ── Servicio finalizado: mostrar tipo de cierre ── */
                <div>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#e6f4ea',
                      border: '1px solid #34a853',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#1a7a3c',
                      marginBottom: 10,
                    }}
                  >
                    ✓ Servicio completado
                  </div>

                  <div style={{ marginTop: 4, fontSize: 11, color: '#333', lineHeight: 1.4 }}>
                    <strong>Resolución:</strong> {datos.resolucion}
                  </div>

                  {tipoCierre && (
                    <div style={{ marginTop: 8, fontSize: 11 }}>
                      <strong>Tipo de servicio:</strong>
                      <div
                        style={{
                          marginTop: 4,
                          padding: '4px 8px',
                          background: '#f0f4ff',
                          border: '1px solid #c7d3f5',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#2a3b8f',
                        }}
                      >
                        {ETIQUETA_CIERRE[tipoCierre] ?? tipoCierre}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── En proceso / pendiente: leyenda ── */
                <div
                  style={{
                    background: '#fff8e1',
                    border: '1px solid #f4b400',
                    borderRadius: 4,
                    padding: '10px 12px',
                    fontSize: 11,
                    color: '#7a5500',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    ⏳ Aún estamos trabajando en ello
                  </div>
                  <div>
                    Su equipo se encuentra en proceso de atención.
                    Le notificaremos cuando esté listo.
                  </div>
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── EVALUACIÓN DEL CLIENTE ─────────────────────────── */}
      <div
        style={{
          border: '1px solid #ccc',
          padding: '8px 12px',
          marginBottom: 16,
          background: '#fafafa',
        }}
      >
        <div style={{ fontSize: 11, marginBottom: 6 }}>
          <strong>Estimado cliente,</strong> el servicio recibido fue:
        </div>
        <div style={{ marginBottom: 6 }}>
          <RadioCheck checked={evaluacion.calificacion === 'bueno'} label="Bueno" />
          <RadioCheck checked={evaluacion.calificacion === 'regular'} label="Regular" />
          <RadioCheck checked={evaluacion.calificacion === 'malo'} label="Malo" />
        </div>
        <div style={{ fontSize: 11 }}>
          <strong>Comentarios:</strong>{' '}
          <span
            style={{
              borderBottom: '1px solid #333',
              display: 'inline-block',
              minWidth: 300,
              paddingBottom: 2,
            }}
          >
            {evaluacion.comentarios ?? ''}
          </span>
        </div>
      </div>

      {/* ─── FIRMA ──────────────────────────────────────────── */}
      <table style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'bottom', paddingRight: 20 }}>
              <div
                style={{
                  borderTop: '1px solid #333',
                  paddingTop: 6,
                  fontSize: 11,
                  textAlign: 'center',
                }}
              >
                Responsable: {tecnicoAtendio}
              </div>
            </td>
            <td style={{ width: '50%', verticalAlign: 'bottom', paddingLeft: 20 }}>
              <div
                style={{
                  borderTop: '1px solid #333',
                  paddingTop: 6,
                  fontSize: 11,
                  textAlign: 'center',
                }}
              >
                Nombre y firma del cliente:{' '}
                {nombreFirmaCliente ? (
                  <strong>{nombreFirmaCliente}</strong>
                ) : (
                  <span style={{ color: '#aaa' }}>___________________________</span>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}