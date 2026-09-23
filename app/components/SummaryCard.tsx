import type { CSSProperties, ReactNode } from 'react';

interface SummaryCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'default' | 'info' | 'success' | 'warning' | 'danger' | 'critical';
  onClick?: () => void;
}

const variantStyles: Record<string, { bg: string; border: string; accent: string; iconBg: string; labelColor: string }> = {
  default: {
    bg: 'linear-gradient(180deg, var(--sys-bg-white), var(--sys-surface-tint))',
    border: 'var(--sys-border)',
    accent: 'var(--sys-primary)',
    iconBg: 'var(--sys-primary-light)',
    labelColor: 'var(--sys-text-muted)',
  },
  info: {
    bg: 'linear-gradient(180deg, var(--sys-bg-white), var(--sys-info-bg))',
    border: 'var(--sys-info-border)',
    accent: 'var(--sys-info)',
    iconBg: 'var(--sys-info-bg)',
    labelColor: 'var(--sys-info-text)',
  },
  success: {
    bg: 'linear-gradient(180deg, var(--sys-bg-white), var(--sys-success-bg))',
    border: 'var(--sys-success-border)',
    accent: 'var(--sys-success)',
    iconBg: 'var(--sys-success-bg)',
    labelColor: 'var(--sys-success-text)',
  },
  warning: {
    bg: 'linear-gradient(180deg, var(--sys-bg-white), var(--sys-warning-bg))',
    border: 'var(--sys-warning-border)',
    accent: 'var(--sys-warning)',
    iconBg: 'var(--sys-warning-bg)',
    labelColor: 'var(--sys-warning-text)',
  },
  danger: {
    bg: 'linear-gradient(180deg, var(--sys-bg-white), var(--sys-danger-bg))',
    border: 'var(--sys-danger-border)',
    accent: 'var(--sys-danger)',
    iconBg: 'var(--sys-danger-bg)',
    labelColor: 'var(--sys-danger-text)',
  },
  critical: {
    bg: 'linear-gradient(180deg, var(--sys-bg-white), var(--sys-danger-bg))',
    border: 'var(--sys-danger-border)',
    accent: 'var(--sys-danger)',
    iconBg: 'var(--sys-danger-bg)',
    labelColor: 'var(--sys-danger-text)',
  },
};

export default function SummaryCard({ label, value, subtitle, icon, variant = 'default', onClick }: SummaryCardProps) {
  const style = variantStyles[variant];
  const customStyle = {
    '--summary-bg': style.bg,
    '--summary-border': style.border,
    '--summary-accent': style.accent,
    '--summary-icon-bg': style.iconBg,
    cursor: onClick ? 'pointer' : 'default',
  } as CSSProperties;

  return (
    <div className="summary-card" style={customStyle} onClick={onClick}>
      <div>
        <div className="label" style={{ color: style.labelColor }}>{label}</div>
        <div className="value">{value}</div>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      <div className="summary-icon">
        {icon}
      </div>
    </div>
  );
}
