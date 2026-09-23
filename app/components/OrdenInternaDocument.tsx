import type { DocumentoOrdenInterno } from '../../src/types/documentos';

interface Props {
  datos: DocumentoOrdenInterno;
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

function nombreCompleto(perfil?: {
  nombres: string;
  apellido_paterno: string;
  apellido_materno?: string | null;
} | null): string {
  if (!perfil) return '—';
  return [perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno]
    .filter(Boolean)
    .join(' ');
}

// El join de Supabase a cierre_orden puede llegar como objeto único o como
// arreglo (según cómo PostgREST infiera la relación), así que normalizamos.
function obtenerObservacionesFinales(
  cierreOrden: unknown
): string | null {
  if (!cierreOrden) return null;
  const registro = Array.isArray(cierreOrden) ? cierreOrden[0] : cierreOrden;
  return (registro as { observaciones_finales?: string | null } | undefined)
    ?.observaciones_finales ?? null;
}

// Checkbox visual simple
function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          border: '1px solid #333',
          background: checked ? '#333' : 'transparent',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11 }}>{label}</span>
    </div>
  );
}

export default function OrdenInternaDocument({ datos }: Props) {
  const { empresa, orden, cliente, tecnico, checklist, cierre, nombreFirmaCliente } =
    datos;

  const fechaOrden = formatFecha(orden.created);
  const horaOrden = formatHora(orden.created);
  const nombreCliente = cliente.nombre ?? orden.cliente_nombre ?? '—';
  // No mostramos el UUID — se puede derivar si es necesario internamente

  // Fecha/hora en que se generó/imprimió este documento (distinta a la fecha de creación de la orden)
  const ahoraISO = new Date().toISOString();
  const fechaImpresion = formatFecha(ahoraISO);
  const horaImpresion = formatHora(ahoraISO);

  // El servicio se considera finalizado según el propio registro de la orden
  // (no dependemos de un campo `estadoOrden` aparte que puede no llegar del mapper)
  const finalizado = orden.estado === 'finalizado' || Boolean(orden.finalized_at);

  // La resolución real vive en cierre_orden.observaciones_finales (tabla de cierre).
  // datos.resolucion / orden.observaciones quedan como respaldo por si algún
  // día se manda ya armado desde el mapper.
  const resolucionFinal =
    obtenerObservacionesFinales((orden as any).cierre_orden) ||
    datos.resolucion ||
    orden.observaciones ||
    null;

  return (
    <div
      id="orden-interna"
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
        {/* Logo / nombre empresa */}
        <div style={{ width: '40%', display: 'flex', alignItems: 'center' }}>
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

        {/* Folio + fecha */}
        <div style={{ width: '25%', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#666' }}>{fechaImpresion}</div>
          <div style={{ fontSize: 10, color: '#666' }}>{horaImpresion}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 4 }}>
            Orden #{orden.numero_orden}
          </div>
          {/* Badge INTERNA */}
          <div
            style={{
              display: 'inline-block',
              background: '#1a1a2e',
              color: '#fff',
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 3,
              marginTop: 4,
              letterSpacing: 1,
            }}
          >
            USO INTERNO
          </div>
        </div>
      </div>
      <hr style={{ borderTop: '2px solid #000', margin: '8px 0' }} />

      {/* ─── CLIENTE + TÉCNICO ──────────────────────────────── */}
      <table style={{ width: '100%', marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%' }}>
              <span style={{ fontSize: 13, fontWeight: 'bold' }}>{nombreCliente}</span>
              {cliente.empresa?.nombre && (
                <div style={{ fontSize: 10, color: '#555' }}>
                  Empresa: {cliente.empresa.nombre}
                </div>
              )}
            </td>
            <td style={{ width: '50%', textAlign: 'right' }}>
              <span style={{ fontSize: 11 }}>
                <strong> Atendió:{' '}</strong>
                {tecnico.nombreRealizado}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── TÍTULO ORDEN ───────────────────────────────────── */}
      <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 'bold', margin: '8px 0' }}>
        ORDEN DE SERVICIO
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#444', marginBottom: 10 }}>
        Creada el: {fechaOrden} a las {horaOrden}
      </div>

      {/* ─── INFO ORDEN ─────────────────────────────────────── */}
      <table style={{ width: '100%', fontSize: 11, marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ width: '33%' }}>
              <strong>Actividad:</strong> {orden.actividad}
            </td>
            <td style={{ width: '33%' }}>
              <strong>Prioridad:</strong> {orden.prioridad}
            </td>
            <td style={{ width: '33%' }}>
              <strong>Estado:</strong> {orden.estado}
            </td>
          </tr>
          <tr>
            <td>
              <strong>Equipo:</strong> {orden.equipo ?? '—'}
            </td>
            <td>
              <strong>Responsable:</strong> {tecnico.nombreResponsable}
            </td>

          </tr>
          {orden.finalized_at && (
            <tr>
              <td colSpan={3}>
                <strong>Finalizado:</strong> {formatFecha(orden.finalized_at)} a las{' '}
                {formatHora(orden.finalized_at)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <hr style={{ borderTop: '1px solid #555', margin: '6px 0' }} />

      {/* ─── PROBLEMA / DESCRIPCIÓN ─────────────────────────── */}
      <table style={{ width: '100%', marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>
                Descripción del servicio:              </div>
              <div style={{ fontSize: 11, minHeight: 40 }}>{orden.problema ?? '—'}</div>
            </td>
            <td
              style={{
                width: '50%',
                verticalAlign: 'top',
                paddingLeft: 16,
                borderLeft: '1px solid #ccc',
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>
                Recomendaciones y/o pendientes:
              </div>
              <Checkbox checked={checklist.respaldoInformacion} label="Respaldo de información" />
              <Checkbox
                checked={checklist.equiposBienConectados}
                label="Que los equipos queden bien conectados (teclado, mouse, etc.)"
              />
              <Checkbox
                checked={checklist.notificarDesperfectos}
                label="Si se ve algún desperfecto o posible fallo, hacerlo saber al cliente"
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── DESCRIPCIÓN DEL SERVICIO ───────────────────────── */}
      <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>
        Resolución:
      </div>
      <div
        style={{
          border: '1px solid #aaa',
          minHeight: 60,
          padding: 8,
          fontSize: 12,
          marginBottom: 10,
        }}
      >
        {finalizado ? (
          resolucionFinal || '—'
        ) : (
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
              El equipo se encuentra en proceso de atención.
            </div>
          </div>
        )}
      </div>

      {/* ─── APOYOS ─────────────────────────────────────────── */}
      {tecnico.apoyos && tecnico.apoyos.length > 0 && (
        <>
          <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>
            Técnicos de apoyo:
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Técnico
                </th>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Notas
                </th>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Asignado por
                </th>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody>
              {tecnico.apoyos.map((a) => (
                <tr key={a.id_apoyo}>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>
                    {nombreCompleto(a.tecnico_perfil)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>
                    {a.notas ?? '—'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>
                    {nombreCompleto(a.realizado_por_perfil)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>
                    {formatFecha(a.created)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ─── NOTAS INTERNAS ─────────────────────────────────── */}
      {tecnico.notas && tecnico.notas.length > 0 && (
        <>
          <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>Notas internas:</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Tipo
                </th>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Nota
                </th>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Realizado por
                </th>
                <th style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'left' }}>
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody>
              {tecnico.notas.map((n) => (
                <tr key={n.id_nota}>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{n.tipo}</td>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{n.nota}</td>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>
                    {nombreCompleto(n.realizado_por_perfil)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>
                    {formatFecha(n.created)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <hr style={{ borderTop: '1px solid #555', margin: '6px 0' }} />

      {/* ─── CIERRE DEL SERVICIO ────────────────────────────── */}
      <table style={{ width: '100%', marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ width: '40%', verticalAlign: 'top' }}>

              <div style={{ fontSize: 11, marginBottom: 2 }}>
                <strong>Servicio Cerrado:</strong>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <Checkbox checked={cierre.estado === 'si'} label="Sí" />
                <Checkbox checked={cierre.estado === 'no'} label="No" />
                <Checkbox checked={cierre.estado === 'cancelado'} label="Cancelado" />
              </div>
            </td>
            <td style={{ width: '35%', verticalAlign: 'top' }}>
              <div style={{ fontSize: 11, marginBottom: 2 }}>
                <strong>Tipo:</strong>
              </div>
              <Checkbox checked={cierre.tipo === 'poliza'} label="Póliza" />
              <Checkbox checked={cierre.tipo === 'garantia'} label="Garantía" />
              <Checkbox checked={cierre.tipo === 'cortesia'} label="Cortesía" />
            </td>
            <td style={{ width: '25%', verticalAlign: 'top' }}>
              <Checkbox checked={cierre.capturado} label="Capturado" />
              <div style={{ fontSize: 11, marginTop: 6 }}>
                <strong>Cobrar:</strong>{' '}
                {cierre.montoACobrar != null && cierre.montoACobrar !== ''
                  ? `$${cierre.montoACobrar}`
                  : '___________'}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── FIRMA CLIENTE ──────────────────────────────────── */}
      <div
        style={{
          borderTop: '1px solid #333',
          paddingTop: 6,
          fontSize: 11,
          marginTop: 12,
        }}
      >
        Nombre y firma del cliente:{' '}
        <span style={{ borderBottom: '1px solid #333', display: 'inline-block', minWidth: 200 }}>
          {nombreFirmaCliente ?? ''}
        </span>
      </div>
    </div>
  );
}