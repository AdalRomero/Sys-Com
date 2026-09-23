/**
 * ImprimirOrdenModal.tsx
 * Modal que pregunta al usuario si quiere imprimir el documento INTERNO
 * (uso del personal) o el documento para el CLIENTE.
 * Al confirmar, abre una ventana de impresión del navegador con el
 * documento correcto renderizado.
 */

'use client';

import { useState, useEffect } from 'react';
import { Printer, X, Shield, User, Loader2 } from 'lucide-react';
import type { Orden, AsignacionApoyo, OrdenNota } from '../../src/types';
import type {
  CierreServicio,
  ChecklistRecomendaciones,
  DocumentoOrdenInterno,
  DocumentoOrdenCliente,
} from '../../src/types/documentos';
import {
  buildDocumentoInterno,
  buildDocumentoCliente,
  checklistVacio,
  cierreVacio,
  evaluacionVacia,
} from '../../src/lib/ordenDocumentHelpers';
import OrdenInternaDocument from './OrdenInternaDocument';
import OrdenClienteDocument from './OrdenClienteDocument';
import { createPortal } from 'react-dom';

// ─── tipos ───────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: Orden;

  /** Datos extra solo para el documento interno */
  apoyos?: AsignacionApoyo[];
  notas?: OrdenNota[];
  programadoCon?: string | null;
  checklist?: ChecklistRecomendaciones;
  cierre?: CierreServicio;
  nombreFirmaCliente?: string | null;

  /** Descripción redactada para el cliente (documento cliente) */
  descripcionCliente?: string;
}

type TipoDocumento = 'interno' | 'cliente';

// ─── helper de impresión ─────────────────────────────────────────────────────

function imprimirElemento(elementId: string, titulo: string) {
  const contenido = document.getElementById(elementId);
  if (!contenido) return;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (!ventana) {
    alert('Por favor permite las ventanas emergentes para imprimir.');
    return;
  }

  ventana.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${titulo}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #fff; }
          @media print {
            @page { margin: 10mm; size: letter; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${contenido.outerHTML}
      </body>
    </html>
  `);

  ventana.document.close();
  ventana.focus();
  setTimeout(() => {
    ventana.print();
    ventana.close();
  }, 400);
}

// ─── componente ──────────────────────────────────────────────────────────────

export default function ImprimirOrdenModal({
  isOpen,
  onClose,
  orden,
  apoyos = [],
  notas = [],
  programadoCon = null,
  checklist,
  cierre,
  nombreFirmaCliente = null,
  descripcionCliente,
}: Props) {
  const [tipo, setTipo] = useState<TipoDocumento | null>(null);
  const [previsualizando, setPrevisualizando] = useState(false);

  // Documentos construidos de forma async (buildDocumentoInterno/Cliente
  // ahora resuelven la empresa vigente con getEmpresaVigente(), que hace
  // fetch a Supabase o al espejo local — ya no se pueden calcular en línea
  // durante el render).
  const [docInterno, setDocInterno] = useState<DocumentoOrdenInterno | null>(null);
  const [docCliente, setDocCliente] = useState<DocumentoOrdenCliente | null>(null);
  const [cargandoDocs, setCargandoDocs] = useState(false);

  // Resetear estado al cerrar/abrir
  useEffect(() => {
    if (!isOpen) {
      setTipo(null);
      setPrevisualizando(false);
      setDocInterno(null);
      setDocCliente(null);
    }
  }, [isOpen]);

  // ── construir documentos (async) ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    let cancelado = false;
    setCargandoDocs(true);

    const checklistFinal = checklist ?? checklistVacio();
    const cierreFinal = cierre ?? cierreVacio();
    // tipoCierre solo se pasa si el cierre fue explícitamente definido
    const tipoCierreCliente = cierre?.tipo ?? null;

    async function construir() {
      const [interno, cliente] = await Promise.allSettled([
        buildDocumentoInterno(orden, {
          programadoCon,
          checklist: checklistFinal,
          cierre: cierreFinal,
          apoyos,
          notas,
          nombreFirmaCliente,
        }),
        (async () => {
          const cierreData = Array.isArray(orden.cierre_orden)
            ? orden.cierre_orden[0]
            : orden.cierre_orden;
          const resolucion = cierreData?.observaciones_finales || null;

          return buildDocumentoCliente(
            orden,
            descripcionCliente || orden.observaciones || orden.problema || '—',
            {
              tipoCierre: tipoCierreCliente,
              evaluacion: evaluacionVacia(),
              resolucion,
            }
          );
        })(),
      ]);

      if (cancelado) return;

      setDocInterno(interno.status === 'fulfilled' ? interno.value : null);
      if (interno.status === 'rejected') {
        console.error('No se pudo construir el documento interno:', interno.reason);
      }

      setDocCliente(cliente.status === 'fulfilled' ? cliente.value : null);
      if (cliente.status === 'rejected') {
        console.error('No se pudo construir el documento cliente:', cliente.reason);
      }

      setCargandoDocs(false);
    }

    void construir();

    return () => {
      cancelado = true;
    };
    // orden/apoyos/notas/checklist/cierre pueden llegar con nueva identidad
    // en cada render del padre; si eso causa recálculos de más, conviene
    // memoizarlos (useMemo) del lado del componente que renderiza este modal.
  }, [
    isOpen,
    orden,
    apoyos,
    notas,
    programadoCon,
    checklist,
    cierre,
    nombreFirmaCliente,
    descripcionCliente,
  ]);

  if (!isOpen) return null;

  const handleImprimir = () => {
    if (tipo === 'interno') {
      imprimirElemento('orden-interna', `Orden Interna #${orden.numero_orden}`);
    } else {
      imprimirElemento('orden-cliente', `Orden de Servicio #${orden.numero_orden}`);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  const overlay = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Panel principal ── */}
      <div
        style={{
          background: 'var(--sys-bg, #fff)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          width: previsualizando ? '94vw' : 480,
          maxWidth: '98vw',
          maxHeight: '94vh',
          overflowY: 'auto',
          margin: 'auto',
          padding: '28px 32px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cerrar */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sys-text-light, #999)', padding: 4,
          }}
          title="Cerrar"
        >
          <X size={20} />
        </button>

        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Printer size={22} style={{ color: 'var(--sys-primary, #4f46e5)' }} />
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--sys-text-dark, #111)' }}>
              Imprimir Orden #{orden.numero_orden}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--sys-text-muted, #888)', margin: '2px 0 0' }}>
              Selecciona el tipo de documento a imprimir
            </p>
          </div>
        </div>

        {/* Selección de tipo */}
        {!previsualizando && (
          <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
            {/* Interno */}
            <button
              onClick={() => setTipo('interno')}
              style={{
                flex: 1,
                border: `2px solid ${tipo === 'interno' ? 'var(--sys-primary, #4f46e5)' : 'var(--sys-border, #e0e0e0)'}`,
                borderRadius: 10,
                padding: '18px 14px',
                background: tipo === 'interno' ? 'var(--sys-primary-light, #eef2ff)' : 'var(--sys-card-bg, #fafafa)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <Shield
                size={28}
                style={{
                  color: tipo === 'interno' ? 'var(--sys-primary, #4f46e5)' : 'var(--sys-text-muted, #888)',
                  marginBottom: 8,
                }}
              />
              <div style={{
                fontWeight: 700, fontSize: 14,
                color: tipo === 'interno' ? 'var(--sys-primary, #4f46e5)' : 'var(--sys-text-dark, #111)',
                marginBottom: 4,
              }}>
                Uso Interno
              </div>
              <div style={{ fontSize: 11, color: 'var(--sys-text-muted, #888)', lineHeight: 1.4 }}>
                Información completa: técnico, notas, apoyos, cierre, monto y estado
              </div>
            </button>

            {/* Cliente */}
            <button
              onClick={() => setTipo('cliente')}
              style={{
                flex: 1,
                border: `2px solid ${tipo === 'cliente' ? 'var(--sys-success, #16a34a)' : 'var(--sys-border, #e0e0e0)'}`,
                borderRadius: 10,
                padding: '18px 14px',
                background: tipo === 'cliente' ? 'var(--sys-success-light, #f0fdf4)' : 'var(--sys-card-bg, #fafafa)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <User
                size={28}
                style={{
                  color: tipo === 'cliente' ? 'var(--sys-success, #16a34a)' : 'var(--sys-text-muted, #888)',
                  marginBottom: 8,
                }}
              />
              <div style={{
                fontWeight: 700, fontSize: 14,
                color: tipo === 'cliente' ? 'var(--sys-success, #16a34a)' : 'var(--sys-text-dark, #111)',
                marginBottom: 4,
              }}>
                Para el Cliente
              </div>
              <div style={{ fontSize: 11, color: 'var(--sys-text-muted, #888)', lineHeight: 1.4 }}>
                Solo info pública: servicio realizado, técnico, checklist y evaluación
              </div>
            </button>
          </div>
        )}

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {previsualizando && (
            <button
              className="btn btn-ghost"
              onClick={() => setPrevisualizando(false)}
            >
              ← Volver
            </button>
          )}
          {!previsualizando && tipo && (
            <button
              className="btn btn-ghost"
              onClick={() => setPrevisualizando(true)}
              disabled={cargandoDocs}
            >
              Vista previa
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!tipo || cargandoDocs}
            style={{ opacity: tipo && !cargandoDocs ? 1 : 0.45, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleImprimir}
          >
            {cargandoDocs ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            {cargandoDocs ? 'Cargando…' : 'Imprimir'}
          </button>
        </div>

        {/* Vista previa del documento seleccionado */}
        {previsualizando && tipo && (
          <div
            style={{
              marginTop: 24,
              border: '1px solid var(--sys-border, #e0e0e0)',
              borderRadius: 8,
              overflow: 'hidden',
              transform: 'scale(0.85)',
              transformOrigin: 'top center',
              pointerEvents: 'none',
            }}
          >
            {tipo === 'interno' && docInterno && (
              <OrdenInternaDocument datos={docInterno} />
            )}
            {tipo === 'cliente' && docCliente && (
              <OrdenClienteDocument datos={docCliente} />
            )}
          </div>
        )}

        {/* Renderizado oculto para imprimir (siempre presente si hay datos) */}
        <div style={{ display: 'none' }}>
          {docInterno && <OrdenInternaDocument datos={docInterno} />}
          {docCliente && <OrdenClienteDocument datos={docCliente} />}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}