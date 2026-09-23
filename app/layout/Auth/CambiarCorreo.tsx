import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // 1. Cambiado useParams por useLocation
import { Mail, AlertCircle } from 'lucide-react';
import { updateOwnEmail, adminUpdateUserEmail } from '../../../src/service/auth.service';

import WarningModal from '../../components/modals/WarningModal';
import SuccessModal from '../../components/modals/SuccessModal';
import ErrorModal from '../../components/modals/ErrorModal';

export default function CambiarCorreo() {
    const navigate = useNavigate();
    const location = useLocation(); // 2. Instanciar el hook de localización

    // 3. Extraer de forma segura el ID oculto enviado a través del estado de navegación
    const stateData = location.state as { authUsuarioId?: string } | null;
    const userId = stateData?.authUsuarioId;
    const isAdminMode = Boolean(userId);

    // Estados del formulario
    const [email, setEmail] = useState('');
    const [confirmEmail, setConfirmEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');

    // Estados de los modales
    const [showWarning, setShowWarning] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const [apiErrorMsg, setApiErrorMsg] = useState('');

    // 4. Validar y mostrar advertencia antes de enviar
    const handlePreSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (email !== confirmEmail) {
            setFormError('Los correos electrónicos no coinciden.');
            return;
        }

        setShowWarning(true);
    };

    // 5. Ejecutar la actualización (Propia o vía Edge Function para Terceros)
    const handleUpdate = async () => {
        setShowWarning(false);
        setLoading(true);

        let res;

        // Se usa la variable 'userId' obtenida del estado oculto
        if (isAdminMode && userId) {
            // Modo Administrador: Llama a la Edge Function 'update-auth-email'
            res = await adminUpdateUserEmail(userId, email);
        } else {
            // Modo Usuario: Actualiza su propio correo electrónico
            res = await updateOwnEmail(email);
        }

        if (!res.success) {
            setApiErrorMsg(res.error || 'Ocurrió un error al actualizar el correo.');
            setShowError(true);
        } else {
            setShowSuccess(true);
        }

        setLoading(false);
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--sys-bg)',
            padding: 20
        }}>
            <div className="card animate-fade-in-up" style={{
                maxWidth: 400,
                width: '100%',
                padding: 40,
                boxShadow: 'var(--sys-shadow-soft)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        backgroundColor: 'var(--sys-primary-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <Mail size={32} style={{ color: 'var(--sys-primary)' }} />
                    </div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: 24, color: 'var(--sys-text-dark)' }}>
                        {isAdminMode ? 'Modificar Correo de Usuario' : 'Actualizar Correo'}
                    </h2>
                    <p style={{ color: 'var(--sys-text-muted)', fontSize: 14 }}>
                        {isAdminMode
                            ? 'Ingresa la nueva dirección de correo para este usuario en el sistema.'
                            : 'Ingresa tu nueva dirección de correo electrónico.'
                        }
                    </p>
                </div>

                <form onSubmit={handlePreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {formError && (
                        <div style={{ padding: 12, backgroundColor: 'var(--sys-danger-bg)', color: 'var(--sys-danger)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle size={16} style={{ flexShrink: 0 }} />
                            <span style={{ lineHeight: 1.4 }}>{formError}</span>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label" style={{ marginBottom: 6 }}>Nuevo Correo Electrónico</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="email"
                                className="form-input"
                                style={{ paddingLeft: 38 }}
                                placeholder="ejemplo@correo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ marginBottom: 6 }}>Confirmar Nuevo Correo</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="email"
                                className="form-input"
                                style={{ paddingLeft: 38 }}
                                placeholder="Repite tu correo"
                                value={confirmEmail}
                                onChange={(e) => setConfirmEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8, padding: '12px 0', textAlign: 'center', justifyContent: 'center' }} disabled={loading}>
                        {loading ? 'Procesando...' : isAdminMode ? 'Forzar Cambio de Correo' : 'Actualizar Correo'}
                    </button>

                    <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: '100%', padding: '12px 0', textAlign: 'center', justifyContent: 'center', marginTop: -8 }}
                        onClick={() => navigate(-1)}
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                </form>
            </div>

            {/* Warning Modal */}
            <WarningModal
                isOpen={showWarning}
                onClose={() => setShowWarning(false)}
                onConfirm={handleUpdate}
                title={isAdminMode ? "Confirmar Cambio Administrativo" : "Confirmar Cambio de Correo"}
                message={isAdminMode ? (
                    <>
                        ¿Estás seguro de cambiar el correo del usuario a <strong>{email}</strong>? La Edge Function lo gestionará de forma segura.
                    </>
                ) : (
                    <>
                        Se enviará un enlace de confirmación a <strong>{email}</strong>. ¿Estás seguro de que deseas continuar?
                    </>
                )}
            />

            {/* Success Modal */}
            <SuccessModal
                isOpen={showSuccess}
                onClose={() => {
                    setShowSuccess(false);
                    navigate(-1); // Regresa a la pantalla anterior (perfil propio o lista de administración)
                }}
                title="¡Actualización Exitosa!"
                message={isAdminMode ? (
                    <>
                        El correo electrónico se ha modificado y solicitado con éxito de manera administrativa a: <strong>{email}</strong>.
                    </>
                ) : (
                    <>
                        Revisa la bandeja de entrada de tu nuevo correo (y posiblemente la del anterior) para confirmar el cambio a través de los enlaces seguros.
                    </>
                )}
            />

            {/* Error Modal */}
            <ErrorModal
                isOpen={showError}
                onClose={() => setShowError(false)}
                title="Error de Actualización"
                message={apiErrorMsg}
            />
        </div>
    );
}