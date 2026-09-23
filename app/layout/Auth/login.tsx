import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../css/login.css';
import syscomLogo from '../../../assets/syscom-logo-azul.svg';
import AvatarLoader from '../../components/AvatarLoader';
import Banner from '../../components/Banner';
import { loginConProteccion } from '../../../src/service/auth.service';
import { Eye, EyeOff } from 'lucide-react';
import { estaOnline } from '../../../src/lib/conexion';
import { localDb } from '../../../src/lib/localdb';
import { hashPassword, generateSalt } from '../../../src/utils/crypto';
import { useAuth } from '../../../src/context/AuthContext';

function Login() {
    const navigate = useNavigate();
    const { setOfflineSession } = useAuth();

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            setStatus('error');
            setErrorMessage('Por favor ingrese correo y contraseña.');
            return;
        }

        setStatus('loading');
        setErrorMessage('');

        try {
            if (!estaOnline()) {
                // Flujo Offline
                const offlineRecord = await localDb.offline_auth.where('email').equals(email).first();
                if (!offlineRecord) {
                    setStatus('error');
                    setErrorMessage('No hay conexión a internet y este usuario no tiene credenciales cacheadas.');
                    return;
                }

                const MAX_OFFLINE_AGE_DAYS = 14;
                const ageInMs = Date.now() - new Date(offlineRecord.last_login).getTime();
                if (ageInMs > MAX_OFFLINE_AGE_DAYS * 86400000) {
                    setStatus('error');
                    setErrorMessage('Tus credenciales offline han expirado (14 días). Conéctate a internet para iniciar sesión.');
                    return;
                }

                const hash = await hashPassword(password, offlineRecord.salt);
                if (hash === offlineRecord.password_hash) {
                    // Login offline exitoso
                    const offlineData = {
                        email: offlineRecord.email,
                        id: offlineRecord.user_id,
                        perfil: offlineRecord.perfil,
                        timestamp: Date.now()
                    };
                    localStorage.setItem('offline_session', JSON.stringify(offlineData));
                    // Actualizar el contexto de autenticación ANTES de navegar
                    // para que ProtectedRoute encuentre un usuario válido
                    setOfflineSession(offlineData);
                    setStatus('success');
                    navigate('/dashboard');
                } else {
                    setStatus('error');
                    setErrorMessage('Correo o contraseña incorrectos.');
                }
                return;
            }

            // Flujo Online
            // IMPORTANTE: limpiar offline_session ANTES de llamar a loginConProteccion
            // para que cuando onAuthStateChange dispare con el nuevo JWT, no encuentre
            // el bloqueo residual de la sesión offline del usuario anterior.
            localStorage.removeItem('offline_session');
            // También limpiar tokens Supabase del usuario anterior por si no se hizo al cerrar sesión
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            }

            const resultado = await loginConProteccion(email, password);

            if (resultado.success) {
                // Guardar el hash y la sal temporalmente para que AuthContext lo guarde en localDb cuando cargue el perfil
                const salt = generateSalt();
                const hash = await hashPassword(password, salt);
                localStorage.setItem('temp_offline_hash', hash);
                localStorage.setItem('temp_offline_salt', salt);

                setStatus('success');
                navigate('/dashboard');
            } else {
                setStatus('error');
                setErrorMessage(resultado.error || 'Correo o contraseña incorrectos.');
            }
        } catch (err: any) {
            setStatus('error');
            setErrorMessage('Ocurrió un error inesperado.');
        }
    };

    return (
        <div className="login-wrapper">
            <div className="login-panel-image bg-astronaut clip-diagonal">
                <div className="login-panel-image-header">
                    <span className="login-welcome-overlay">Bienvenido De Nuevo!</span>
                </div>
                <img
                    src={syscomLogo}
                    alt="Syscom Logo"
                    className="login-panel-logo"
                />
            </div>

            <div className="login-panel-form ">
                <div className="login-form-inner">
                    <div className="login-form-box">

                        <AvatarLoader status={status} />

                        <h1 className="login-title">Hola Usuario!</h1>
                        <p className="login-subtitle">Bienvenido a Sys-Com</p>

                        <Banner
                            type="error"
                            message={status === 'error' ? errorMessage : ''}
                            onClose={() => setStatus('idle')}
                        />
                        <Banner
                            type="success"
                            message={status === 'success' ? 'Inicio de sesión exitoso!' : ''}
                            onClose={() => setStatus('idle')}
                        />

                        <form onSubmit={handleLogin}>
                            <input
                                type="email"
                                placeholder="Email"
                                className="login-input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={status === 'loading'}
                            />

                            <div className="password-input-container">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Password"
                                    className="login-input login-input-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={status === 'loading'}
                                />
                                <button
                                    type="button"
                                    className="password-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>


                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="login-btn-primary"
                            >
                                {status === 'loading' ? 'Cargando...' : 'Iniciar Sesión'}
                            </button>


                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;