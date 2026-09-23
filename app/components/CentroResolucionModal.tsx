import { useEffect, useState } from 'react';
import { X, AlertTriangle, GitMerge, Loader2 } from 'lucide-react';
import {
    getPeticionDetalle,
    resolverConflicto,
    reintentarPeticionFallida,
    descartarPeticion,
    type PeticionQueueServidor,
} from '../../src/service/peticiones.service';

interface Props {
    idPeticion: string;
    onClose: () => void;
    onResuelto: () => void;
}

const TABLA_LEGIBLE: Record<string, string> = {
    orden_servicio: 'Orden de servicio',
    clientes: 'Cliente',
    empresa: 'Empresa',
    perfil_info: 'Perfil de usuario',
    contacto: 'Contacto',
    orden_apoyo: 'Apoyo de orden',
    orden_nota: 'Nota de orden',
    cierre_orden: 'Cierre de orden',
};

const formatValor = (v: unknown): string => {
    if (v === null || v === undefined) return '(vacío)';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

export default function CentroResolucionModal({ idPeticion, onClose, onResuelto }: Props) {
    const [peticion, setPeticion] = useState<PeticionQueueServidor | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorLocal, setErrorLocal] = useState<string | null>(null);

    // Para conflictos: elección por columna en conflicto
    const [elecciones, setElecciones] = useState<Record<string, 'local' | 'servidor'>>({});
    // Para errores: payload editable como texto JSON
    const [payloadEditado, setPayloadEditado] = useState('');

    useEffect(() => {
        (async () => {
            setIsLoading(true);
            const data = await getPeticionDetalle(idPeticion);
            setPeticion(data);
            if (data?.datos_conflicto) {
                const inicial: Record<string, 'local' | 'servidor'> = {};
                for (const col of data.datos_conflicto.columnas_chocan) inicial[col] = 'local';
                setElecciones(inicial);
            }
            if (data?.estado === 'fallido') {
                setPayloadEditado(JSON.stringify(data.payload, null, 2));
            }
            setIsLoading(false);
        })();
    }, [idPeticion]);

    const handleResolverConflicto = async () => {
        setIsSubmitting(true);
        setErrorLocal(null);
        const res = await resolverConflicto(idPeticion, elecciones);
        setIsSubmitting(false);
        if (!res.success) {
            setErrorLocal(res.error || 'No se pudo resolver el conflicto.');
            return;
        }
        onResuelto();
    };

    const handleReintentar = async (conCambios: boolean) => {
        setIsSubmitting(true);
        setErrorLocal(null);

        let payloadCorregido: Record<string, unknown> | undefined;
        if (conCambios) {
            try {
                payloadCorregido = JSON.parse(payloadEditado);
            } catch {
                setIsSubmitting(false);
                setErrorLocal('El JSON no es válido. Revisa la sintaxis.');
                return;
            }
        }

        const res = await reintentarPeticionFallida(idPeticion, payloadCorregido);
        setIsSubmitting(false);
        if (!res.success) {
            setErrorLocal(res.error || 'No se pudo reintentar la petición.');
            return;
        }
        onResuelto();
    };

    const handleDescartar = async () => {
        if (!confirm('¿Descartar esta petición? No se aplicará y quedará en el historial como descartada.')) return;
        setIsSubmitting(true);
        setErrorLocal(null);
        const res = await descartarPeticion(idPeticion);
        setIsSubmitting(false);
        if (!res.success) {
            setErrorLocal(res.error || 'No se pudo descartar la petición.');
            return;
        }
        onResuelto();
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--sys-surface)', borderRadius: 'var(--sys-radius-lg)',
                    width: 520, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto',
                    boxShadow: 'var(--sys-shadow-lg)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{
                    padding: 16, borderBottom: '1px solid var(--sys-border-light)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sys-text-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {peticion?.estado === 'conflicto' ? <GitMerge size={18} /> : <AlertTriangle size={18} style={{ color: 'var(--sys-danger)' }} />}
                        {peticion?.estado === 'conflicto' ? 'Resolver conflicto' : 'Petición con error'}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sys-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: 16 }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: 32, color: 'var(--sys-text-muted)' }}>
                            <Loader2 className="spin" size={24} style={{ animation: 'spin 0.8s linear infinite' }} />
                            <p style={{ marginTop: 8 }}>Cargando detalle...</p>
                        </div>
                    ) : !peticion ? (
                        <p style={{ color: 'var(--sys-text-muted)' }}>No se encontró la petición.</p>
                    ) : (
                        <>
                            <p style={{ fontSize: 13, color: 'var(--sys-text-muted)', marginBottom: 16 }}>
                                Tabla: <strong>{TABLA_LEGIBLE[peticion.tabla_destino] || peticion.tabla_destino}</strong>
                                {' · '}Intento {peticion.intentos} de {peticion.max_intentos}
                            </p>

                            {peticion.estado === 'conflicto' && peticion.datos_conflicto && (
                                <div>
                                    <p style={{ fontSize: 13, marginBottom: 12 }}>
                                        Esto cambió en ambos lados mientras estabas sin conexión. Elige qué valor debe quedar para cada campo:
                                    </p>
                                    {peticion.datos_conflicto.columnas_chocan.map((col) => (
                                        <div key={col} style={{ marginBottom: 14, padding: 10, background: 'var(--sys-bg)', borderRadius: 8 }}>
                                            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>{col}</p>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name={`col-${col}`}
                                                    checked={elecciones[col] === 'local'}
                                                    onChange={() => setElecciones((p) => ({ ...p, [col]: 'local' }))}
                                                />
                                                Tu valor: <strong>{formatValor(peticion.datos_conflicto?.tu_payload[col])}</strong>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name={`col-${col}`}
                                                    checked={elecciones[col] === 'servidor'}
                                                    onChange={() => setElecciones((p) => ({ ...p, [col]: 'servidor' }))}
                                                />
                                                Valor en servidor: <strong>{formatValor(peticion.datos_conflicto?.db_actual[col])}</strong>
                                            </label>
                                        </div>
                                    ))}
                                    {errorLocal && <p style={{ color: 'var(--sys-danger)', fontSize: 13 }}>{errorLocal}</p>}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                        <button
                                            onClick={handleResolverConflicto}
                                            disabled={isSubmitting}
                                            style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--sys-primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            {isSubmitting ? 'Aplicando...' : 'Aplicar elección'}
                                        </button>
                                        <button
                                            onClick={handleDescartar}
                                            disabled={isSubmitting}
                                            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', cursor: 'pointer' }}
                                        >
                                            Descartar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {peticion.estado === 'fallido' && (
                                <div>
                                    <p style={{ fontSize: 13, color: 'var(--sys-danger)', marginBottom: 12, background: 'var(--sys-bg)', padding: 10, borderRadius: 8 }}>
                                        {peticion.error_detalle}
                                    </p>
                                    <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginBottom: 6 }}>
                                        Payload (puedes corregirlo antes de reintentar):
                                    </p>
                                    <textarea
                                        value={payloadEditado}
                                        onChange={(e) => setPayloadEditado(e.target.value)}
                                        rows={8}
                                        style={{
                                            width: '100%', fontFamily: 'monospace', fontSize: 12,
                                            padding: 8, borderRadius: 8, border: '1px solid var(--sys-border)',
                                            background: 'var(--sys-bg)', color: 'var(--sys-text-dark)', resize: 'vertical',
                                        }}
                                    />
                                    {errorLocal && <p style={{ color: 'var(--sys-danger)', fontSize: 13, marginTop: 8 }}>{errorLocal}</p>}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                        <button
                                            onClick={() => handleReintentar(true)}
                                            disabled={isSubmitting}
                                            style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--sys-primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            {isSubmitting ? 'Reintentando...' : 'Reintentar con estos datos'}
                                        </button>
                                        <button
                                            onClick={handleDescartar}
                                            disabled={isSubmitting}
                                            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', cursor: 'pointer' }}
                                        >
                                            Descartar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}