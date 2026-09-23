import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

export interface CredentialsChangedModalProps {
    isOpen: boolean;
    mensaje: string;
    onSignOut: () => void;
}

// Tiempo que se muestra el aviso antes de forzar el cierre de sesión
// automáticamente. Además del botón manual, esto garantiza que la sesión
// se cierre igual aunque la persona no interactúe con el modal.
const SEGUNDOS_ANTES_DE_CERRAR = 5;

// Modal de interrupción para cambios de credenciales (correo/contraseña)
// hechos por un administrador. A diferencia de WarningModal/ErrorModal,
// este NO se puede descartar haciendo click afuera ni tiene botón de
// "cancelar" — es intencional: la persona debe enterarse sí o sí de que
// sus credenciales cambiaron, sin importar en qué pantalla estaba o si
// estaba interactuando activamente con la app.
export default function CredentialsChangedModal({ isOpen, mensaje, onSignOut }: CredentialsChangedModalProps) {
    const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_ANTES_DE_CERRAR);

    useEffect(() => {
        if (!isOpen) return;
        setSegundosRestantes(SEGUNDOS_ANTES_DE_CERRAR);

        const intervalo = setInterval(() => {
            setSegundosRestantes((s) => (s <= 1 ? 0 : s - 1));
        }, 1000);

        const timeout = setTimeout(() => {
            onSignOut();
        }, SEGUNDOS_ANTES_DE_CERRAR * 1000);

        return () => {
            clearInterval(intervalo);
            clearTimeout(timeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999]">
            {/* Sin onClick en el overlay a propósito: esta interrupción no se
                puede descartar haciendo click afuera. */}
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4 text-center">
                    <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl flex flex-col items-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4 animate-pulse">
                            <ShieldAlert className="h-10 w-10 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold leading-6 text-gray-900 mb-2 text-center">
                            Tus credenciales de acceso cambiaron
                        </h3>
                        <div className="mt-2 mb-6 w-full text-center">
                            <p className="text-sm text-gray-500">{mensaje}</p>
                            <p className="text-sm text-gray-400 mt-3">
                                Cerrando sesión en {segundosRestantes}s…
                            </p>
                        </div>
                        <div className="mt-2 w-full">
                            <button
                                type="button"
                                className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 transition-colors"
                                onClick={onSignOut}
                            >
                                Cerrar sesión ahora
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}