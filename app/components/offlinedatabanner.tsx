import { WifiOff } from 'lucide-react';
import { useConexion } from '../../src/hooks/useConexion';

interface OfflineDataBannerProps {
    /** Texto del aviso. Por defecto sirve para casi cualquier pantalla de datos. */
    mensaje?: string;
}

/**
 * Barrita de aviso para pantallas que leen del espejo local (Dexie) cuando
 * no hay internet -- para que quede claro que lo que se ve puede no estar
 * al día con lo que hay en el servidor.
 *
 * Úsalo en cualquier pantalla que dependa de datos que sí tengan fallback
 * offline (Dashboard, OrdenesPendientes, Clientes, Usuarios, Reportes por
 * cliente, etc.):
 *
 *   <OfflineDataBanner />
 *
 * Se oculta solo cuando vuelve la conexión -- no hace falta desmontarlo
 * condicionalmente desde afuera.
 */
export default function OfflineDataBanner({
    mensaje = 'Estás en modo sin conexión. La información mostrada puede cambiar cuando regrese el internet.',
}: OfflineDataBannerProps) {
    const isOnline = useConexion();
    if (isOnline) return null;

    return (
        <div
            role="status"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.6rem 1rem',
                marginBottom: '1rem',
                borderRadius: 'var(--sys-radius, 8px)',
                background: '#fff7e6',
                border: '1px solid #f2c94c',
                color: '#8a5a00',
                fontSize: '0.85rem',
                fontFamily: "'Open Sans', 'Inter', sans-serif",
            }}
        >
            <WifiOff size={16} style={{ flexShrink: 0 }} />
            <span>{mensaje}</span>
        </div>
    );
}