import type { Prioridad } from '../../src/types';

interface PriorityBadgeProps {
  prioridad: Prioridad;
}

const clasesPrioridad: Record<Prioridad, string> = {
  'baja': 'badge-baja',
  'media': 'badge-media',
  'alto': 'badge-alta',
  'urgente': 'badge-critica',
};

const dotColors: Record<Prioridad, string> = {
  'baja': 'var(--sys-success)',
  'media': 'var(--sys-warning)',
  'alto': 'var(--sys-orange)',
  'urgente': 'var(--sys-danger)',
};

export default function PriorityBadge({ prioridad }: PriorityBadgeProps) {
  return (
    <span className={`badge ${clasesPrioridad[prioridad]}`}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: dotColors[prioridad],
        display: 'inline-block',
      }} />
      {prioridad}
    </span>
  );
}
