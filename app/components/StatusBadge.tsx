import type { EstadoOrden } from '../../src/types';

interface StatusBadgeProps {
  estado: EstadoOrden | 'Urgente';
}

const clasesEstado: Record<string, string> = {
  'pendiente': 'badge-pendiente',
  'en proceso': 'badge-en-proceso',
  'finalizado': 'badge-entregada', // reusing the green style
  'urgente': 'badge-urgente',
};

export default function StatusBadge({ estado }: StatusBadgeProps) {
  return (
    <span className={`badge ${clasesEstado[estado] || 'badge-pendiente'}`}>
      {estado}
    </span>
  );
}
