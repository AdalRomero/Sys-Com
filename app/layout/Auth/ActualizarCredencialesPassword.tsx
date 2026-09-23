import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Key, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../../../src/utils/supabase';

import WarningModal from '../../components/modals/WarningModal';
import SuccessModal from '../../components/modals/SuccessModal';
import ErrorModal from '../../components/modals/ErrorModal';

export default function RestablecerPassword() {
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [isSessionReady, setIsSessionReady] = useState(false);

    const [showWarning, setShowWarning] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const [apiErrorMsg, setApiErrorMsg] = useState('');

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            // 1. Verificar si ya tenemos sesión (el token ya fue procesado)
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                if (isMounted) setIsSessionReady(true);
                return;
            }

            // 2. Si no hay sesión inmediata, escuchar el evento de recuperación
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'PASSWORD_RECOVERY' && session) {
                    if (isMounted) setIsSessionReady(true);
                }
            });

            // 3. Timeout: Si en 5 segundos no validó, el token es inválido/expirado
            const timer = setTimeout(() => {
                if (isMounted && !isSessionReady) {
                    console.error("Enlace expirado o inválido");
                    navigate('/login');
                }
            }, 5000);

            return () => {
                subscription.unsubscribe();
                clearTimeout(timer);
            };
        };

        initAuth();
        return () => { isMounted = false; };
    }, [navigate, isSessionReady]);

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

    const handleActualReset = async () => {
        setShowWarning(false);
        setLoading(true);

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            setApiErrorMsg(error.message);
            setShowError(true);
        } else {
            // Éxito: Limpiar sesión temporal y notificar
            await supabase.auth.signOut();
            setShowSuccess(true);
        }
        setLoading(false);
    };

    // Estado de carga mientras Supabase procesa el token de la URL
    if (!isSessionReady) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sys-bg)' }}>
                <div style={{ marginBottom: 16, border: '4px solid var(--sys-border-light)', borderTop: '4px solid var(--sys-primary)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--sys-text-muted)' }}>Validando enlace de recuperación...</p>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sys-bg)', padding: 20 }}>
            <div className="card" style={{ maxWidth: 400, width: '100%', padding: 40, boxShadow: 'var(--sys-shadow-soft)', position: 'relative' }}>

                <button onClick={() => navigate('/login')} className="btn btn-ghost" style={{ position: 'absolute', top: 16, left: 16, padding: '8px' }}>
                    <ArrowLeft size={18} />
                </button>

                <div style={{ textAlign: 'center', marginBottom: 32, marginTop: 16 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--sys-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Lock size={32} style={{ color: 'var(--sys-primary)' }} />
                    </div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: 24 }}>Restablecer Contraseña</h2>
                    <p style={{ color: 'var(--sys-text-muted)', fontSize: 14 }}>
                        Asigna una nueva contraseña de acceso para su usuario.
                    </p>
                </div>


                <form onSubmit={handlePreSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {formError && (
                        <div style={{ padding: 12, backgroundColor: 'var(--sys-danger-bg)', color: 'var(--sys-danger)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle size={16} /> <span>{formError}</span>
                        </div>
                    )}

                    {/* Campo Nueva Contraseña */}
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label className="form-label">Nueva Contraseña</label>
                        <div style={{ position: 'relative' }}>
                            {/* AQUÍ SE ESTÁ USANDO EL ICONO KEY */}
                            <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="password"
                                className="form-input"
                                style={{ paddingLeft: 38 }} // El padding asegura que el texto no tape el icono
                                value={password}
                                placeholder="Mínimo 8 caracteres"
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Campo Confirmar Contraseña */}
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label className="form-label">Confirmar Contraseña</label>
                        <div style={{ position: 'relative' }}>
                            {/* AQUÍ SE ESTÁ USANDO EL ICONO KEY */}
                            <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-light)' }} />
                            <input
                                type="password"
                                className="form-input"
                                style={{ paddingLeft: 38 }}
                                placeholder="Mínimo 8 caracteres"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8, padding: '12px 0', textAlign: 'center', justifyContent: 'center' }} disabled={loading}>
                        {loading ? 'Procesando...' : 'Actualizar Contraseña'}
                    </button>
                </form>
            </div>

            <WarningModal isOpen={showWarning} onClose={() => setShowWarning(false)} onConfirm={handleActualReset} title="Confirmar" message="¿Estás seguro de actualizar tu contraseña?" />
            <SuccessModal isOpen={showSuccess} onClose={() => navigate('/login')} title="¡Listo!" message="Contraseña actualizada exitosamente." />
            <ErrorModal isOpen={showError} onClose={() => setShowError(false)} title="Error" message={apiErrorMsg} />
        </div>
    );
}