import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      className="animate-fade-in"
    >
      {/* Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--sys-backdrop)',
        }}
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        style={{
          position: 'relative',
          background: 'white',
          borderRadius: 'var(--sys-radius-lg)',
          boxShadow: 'var(--sys-shadow-lg)',
          maxWidth: 500,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--sys-border)',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text-dark)', margin: 0 }}>
            {title}
          </h3>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 20px',
            borderTop: '1px solid var(--sys-border)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
