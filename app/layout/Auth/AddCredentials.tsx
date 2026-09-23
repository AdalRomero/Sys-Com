import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Key, Mail, AlertCircle, ArrowLeft } from 'lucide-react';
import { adminAddUserCredentials } from '../../../src/service/auth.service';

import WarningModal from '../../components/modals/WarningModal';
import SuccessModal from '../../components/modals/SuccessModal';
import ErrorModal from '../../components/modals/ErrorModal';

export default function AsignarCredenciales() {
    const navigate = useNavigate();
    const location = useLocation();

    // Capturamos el objeto completo del usuario desde el state interno del navigate
    const usuario = location.state?.usuario;

    // Estados del formulario
    const [correo, setCorreo] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Estados para validaciones locales
    const [formError, setFormError] = useState('');
    const [loading, setLoading] = useState(false);

    // Estados de control para los modales
    const [showWarning, setShowWarning] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const [apiErrorMsg, setApiErrorMsg] = useState('');

    // Protección de ruta: Si se accede sin un usuario válido, redirigir inmediatamente
    useEffect(() => {
        if (!usuario?.id_perfil_info) {
            navigate('/usuarios', { replace: true });
        } else {
            // Precargar el correo de contacto si existe
            setCorreo(usuario.contacto?.correo_personal || '');
        }
    }, [usuario, navigate]);

    // 1. Validaciones locales antes de detonar confirmación
    const handlePreSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (password !== confirmPassword) {
            setFormError('Las contraseñas no coinciden.');
            return;
        }
        if (password.length < 8) {
            setFormError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }

        setShowWarning(true);
    };

    // 2. Envío final y ejecución del guardado mediante la Edge Function unificada
    const handleActualSubmit = async () => {
        setShowWarning(false);
        setLoading(true);

        // Mandamos solo los 3 parámetros limpios requeridos
        const res = await adminAddUserCredentials(
            usuario.id_perfil_info,
            correo.trim(),
            password
        );

        if (!res.success) {
            setApiErrorMsg(res.error || 'Ocurrió un error al procesar las nuevas credenciales.');
            setShowError(true);
        } else {
            setShowSuccess(true);
        }

        setLoading(false);
    };
    if (!usuario?.id_perfil_info) return null;

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
                maxWidth: 460,
                width: '100%',
                padding: 40,
                boxShadow: 'var(--sys-shadow-soft)',
                position: 'relative'
            }}>

                {/* Botón para regresar al listado sin hacer nada */}
                <button
                    onClick={() => navigate(-1)}
                    className="btn btn-ghost"
                    style={{ position: 'absolute', top: 16, left: 16, padding: '8px' }}
                >
                    <ArrowLeft size={18} />
                </button>

                <div style={{ textAlign: 'center', marginBottom: 28, marginTop: 16 }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        backgroundColor: 'var(--sys-primary-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <ShieldCheck size={32} style={{ color: 'var(--sys-primary)' }} />
                    </div>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: 24, color: 'var(--sys-text-dark)' }}>Generar Acceso</h2>
                    <p style={{ color: 'var(--sys-text-muted)', fontSize: 14, margin: 0 }}>
                        Creando credenciales de autenticación para:<br />
                        <strong>{usuario.nombres} {usuario.apellido_paterno}</strong>
                    </p>
                </div>

                <form onSubmit={handlePreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {formError && (
                        <div style={{ padding: 12, backgroundColor: 'var(--sys-danger-bg)', color: 'var(--sys-danger)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle size={16} style={{ flexShrink: 0 }} />
                            <span style={{ lineHeight: 1.4 }}>{formError}</span>
                        </div>
                    )}

                    {/* Input: Correo Electrónico */}
                    <div className="form-group">
                        <label className="form-label" style={{ marginBottom: 6 }}>Correo de Acceso</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="email"
                                className="form-input"
                                style={{ paddingLeft: 38 }}
                                placeholder="correo@ejemplo.com"
                                value={correo}
                                onChange={(e) => setCorreo(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Input: Contraseña */}
                    <div className="form-group">
                        <label className="form-label" style={{ marginBottom: 6 }}>Contraseña Inicial</label>
                        <div style={{ position: 'relative' }}>
                            <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="password"
                                className="form-input"
                                style={{ paddingLeft: 38 }}
                                placeholder="Mínimo 8 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Input: Confirmar Contraseña */}
                    <div className="form-group">
                        <label className="form-label" style={{ marginBottom: 6 }}>Confirmar Contraseña</label>
                        <div style={{ position: 'relative' }}>
                            <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="password"
                                className="form-input"
                                style={{ paddingLeft: 38 }}
                                placeholder="Repite la contraseña"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: 12, padding: '12px 0', justifyContent: 'center' }}
                        disabled={loading}
                    >
                        {loading ? 'Creando Acceso...' : 'Asignar Credenciales'}
                    </button>
                </form>
            </div>

            {/* Flujo de Modales Reactivos */}
            <WarningModal
                isOpen={showWarning}
                onClose={() => setShowWarning(false)}
                onConfirm={handleActualSubmit}
                title="¿Asignar credenciales de acceso?"
                message="Se dará de alta esta cuenta en el servidor de autenticación de inmediato y se activará el perfil del usuario."
            />

            <SuccessModal
                isOpen={showSuccess}
                onClose={() => {
                    setShowSuccess(false);
                    navigate('/usuarios'); // Retorno automático a la tabla global de personal
                }}
                title="¡Acceso Creado!"
                message="Las credenciales han sido generadas y vinculadas al perfil con éxito."
            />

            <ErrorModal
                isOpen={showError}
                onClose={() => setShowError(false)}
                title="Error de Creación"
                message={apiErrorMsg}
            />
        </div>
    );
}