import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormSelect from '../../components/FormSelect';
import { UserPlus, ArrowLeft, AlertCircle } from 'lucide-react';
import { checkUsernameAvailability, createUsuario } from '../../../src/service/usuarios.service';
import { useConexion } from '../../../src/hooks/useConexion';
import ErrorModal from '../../components/modals/ErrorModal';
import SuccessModal from '../../components/modals/SuccessModal';

export default function NuevoUsuario() {
  const isOnline = useConexion();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);

  const [formData, setFormData] = useState({
    // Perfil_info
    usuario: '',            // username único
    nombres: '',
    apellido_paterno: '',
    apellido_materno: '',
    rol: 'minimo',          // ENUM: administrador | limitado | minimo
    // Contacto
    lada: '',
    telefono: '',
    direccion: '',
    correo_personal: '',
    // Auth
    correo_acceso: '',
    password: '',
    confirmarPassword: '',
  });

  const [usuarioManual, setUsuarioManual] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  const [modalState, setModalState] = useState({
    success: false,
    error: false,
    errorMessage: '',
    successMessage: ''
  });

  // Auto-generación de username
  useEffect(() => {
    if (usuarioManual || !formData.nombres || !formData.apellido_paterno) return;

    const generateUsername = async () => {
      const clean = (str: string) =>
        str.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();

      const n = clean(formData.nombres);
      const p = clean(formData.apellido_paterno);
      const m = clean(formData.apellido_materno);

      if (!n || !p) return;

      setIsCheckingUsername(true);

      const candidates = [];

      // 1. Progresión según letras del nombre + Apellido Paterno
      // Ej: aromero, adromero, adaromero...
      for (let i = 1; i <= n.length; i++) {
        candidates.push(`${n.slice(0, i)}${p}`);
      }

      // 2. Si el paterno sigue ocupado, probamos con el materno
      // Ej: aromerog, adromerog, adaromerog...
      if (m) {
        for (let i = 1; i <= n.length; i++) {
          candidates.push(`${n.slice(0, i)}${p}${m.charAt(0)}`);
        }
      }

      // 3. Comprobamos disponibilidad
      let finalUsername = '';
      for (const candidate of candidates) {
        if (await checkUsernameAvailability(candidate)) {
          finalUsername = candidate;
          break;
        }
      }

      // 4. Último recurso: Números (solo si todo lo anterior está tomado)
      if (!finalUsername) {
        let counter = 1;
        const base = `${n.charAt(0)}${p}`;
        while (true) {
          const attempt = `${base}${counter}`;
          if (await checkUsernameAvailability(attempt)) {
            finalUsername = attempt;
            break;
          }
          counter++;
        }
      }
      // Agregamos el '@' al inicio si no lo tiene ya
      const usernameWithAt = finalUsername.startsWith('@')
        ? finalUsername
        : `@${finalUsername}`;

      setFormData(prev => ({ ...prev, usuario: usernameWithAt }));
      setUsernameError('');
      setIsCheckingUsername(false);
    };

    const timer = setTimeout(generateUsername, 500);
    return () => clearTimeout(timer);
  }, [formData.nombres, formData.apellido_paterno, formData.apellido_materno, usuarioManual]);

  // Validar username manual
  useEffect(() => {
    if (!usuarioManual || !formData.usuario) return;

    const validateUsername = async () => {
      setIsCheckingUsername(true);
      const isAvailable = await checkUsernameAvailability(formData.usuario);
      if (!isAvailable) {
        setUsernameError('Este nombre de usuario ya está en uso.');
      } else {
        setUsernameError('');
      }
      setIsCheckingUsername(false);
    };

    const timer = setTimeout(validateUsername, 500); // debounce
    return () => clearTimeout(timer);
  }, [formData.usuario, usuarioManual]);

  const handleChange = (field: string) => (value: string) => {
    if (field === 'usuario') {
      setUsuarioManual(true);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    const camposObligatorios = [
      { campo: formData.nombres, nombre: 'Nombres' },
      { campo: formData.apellido_paterno, nombre: 'Apellido Paterno' },
      { campo: formData.correo_acceso, nombre: 'Correo de Acceso' },
      { campo: formData.usuario, nombre: 'Nombre de Usuario' },
      { campo: formData.password, nombre: 'Contraseña' },
      { campo: formData.confirmarPassword, nombre: 'Confirmar Contraseña' },
    ];
    const campoVacio = camposObligatorios.find(c => !c.campo || c.campo.trim() === '');

    if (campoVacio) {
      setModalState({
        ...modalState,
        error: true,
        errorMessage: `El campo "${campoVacio.nombre}" es obligatorio y no puede estar vacío.`
      });
      return;
    }

    if (formData.password !== formData.confirmarPassword) {
      setModalState({ ...modalState, error: true, errorMessage: 'Las contraseñas no coinciden.' });
      return;
    }
    if (usernameError) {
      setModalState({ ...modalState, error: true, errorMessage: 'Corrija los errores antes de continuar.' });
      return;
    }


    const usuarioPayload = {
      nombres: formData.nombres,
      apellido_paterno: formData.apellido_paterno,
      apellido_materno: formData.apellido_materno,
      usuario: formData.usuario,
      rol: formData.rol,
      correo_acceso: formData.correo_acceso,
      password: formData.password,
      // Aseguramos que la estructura sea clara para el servicio
      contacto: {
        correo_personal: formData.correo_personal,
        lada: formData.lada,
        telefono: formData.telefono,
        direccion: formData.direccion
      }
    };
    setEnviando(true);
    const res = await createUsuario(usuarioPayload);

    if (res.success) {
      setModalState({ ...modalState, success: true, successMessage: 'Usuario creado exitosamente.' });
    } else {
      setModalState({ ...modalState, error: true, errorMessage: res.error || 'Error al crear el usuario.' });
    }
  };

  const handleSuccessClose = () => {
    setModalState({ ...modalState, success: false });
    navigate('/usuarios');
  };

  return (
    <>
      <Header title="Nuevo Usuario" />
      <div className="app-content">
        <div className="page-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            <div>
              <h1>Registro de Usuario</h1>
              <p>Complete los detalles para generar una nueva cuenta de usuario.</p>
            </div>
          </div>
          <div className="action-bar">
            <button className="btn btn-primary" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Regresar
            </button>
          </div>
        </div>

        {!isOnline && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} />
            <span>No puedes registrar nuevos usuarios sin conexión a internet. La creación de credenciales requiere acceso directo al servidor.</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Perfil_info */}
          <div className="form-section form-section-service animate-fade-in-up">
            <h3 className="form-section-title">Información Personal</h3>
            <div className="form-grid-3">
              <FormInput
                label="Nombres"
                placeholder="Ej. Juan Carlos"
                value={formData.nombres}
                onChange={handleChange('nombres')}
                required
                id="nu-nombres"
              />
              <FormInput
                label="Apellido Paterno"
                placeholder="Ej. Delgado"
                value={formData.apellido_paterno}
                onChange={handleChange('apellido_paterno')}
                required
                id="nu-apellido-paterno"
              />
              <FormInput
                label="Apellido Materno"
                placeholder="Ej. Torres"
                value={formData.apellido_materno}
                onChange={handleChange('apellido_materno')}
                id="nu-apellido-materno"
              />
              <FormSelect
                label="Rol del Usuario"
                value={formData.rol}
                onChange={handleChange('rol')}
                id="nu-rol"
                options={[
                  { value: 'administrador', label: 'Administrador — Acceso total (CRUD)' },
                  { value: 'limitado', label: 'Limitado — Lee todo, solicita cambios' },
                  { value: 'minimo', label: 'Mínimo — Solo sus clientes y órdenes' },
                ]}
              />
            </div>
          </div>

          {/* Contacto */}
          <div className="form-section form-section-client animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <h3 className="form-section-title">Información de Contacto</h3>
            <div className="form-grid-2">
              <FormInput
                label="Correo Personal"
                placeholder="correo@ejemplo.com"
                value={formData.correo_personal}
                onChange={handleChange('correo_personal')}
                type="email"
                id="nu-correo-personal"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 90 }}>
                  <FormInput
                    label="Lada"
                    placeholder="52"
                    value={formData.lada}
                    onChange={handleChange('lada')}
                    id="nu-lada"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <FormInput
                    label="Teléfono"
                    placeholder="55 1234 5678"
                    value={formData.telefono}
                    onChange={handleChange('telefono')}
                    id="nu-telefono"
                  />
                </div>
              </div>
            </div>
            <FormInput
              label="Dirección"
              placeholder="Av. Insurgentes 123, Col. Roma, CDMX"
              value={formData.direccion}
              onChange={handleChange('direccion')}
              id="nu-direccion"
            />
          </div>

          {/* Credenciales de Acceso (auth.users) */}
          <div className="form-section form-section-equipment animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="form-section-title">Credenciales de Acceso</h3>
            <div className="form-grid-2">
              <FormInput
                label="Correo de Acceso"
                id="input-u-mail" // Cambia el id para que no contenga 'email' o 'correo'
                type="email"
                autoComplete="off"
                // @ts-ignore
                name="field_a_random" // Agrega un nombre que no signifique nada
                value={formData.correo_acceso}
                onChange={handleChange('correo_acceso')}
                required
              />
              <div>
                <FormInput
                  label="Nombre de Usuario (único)"
                  placeholder="Ej. jdelgado"
                  value={formData.usuario}
                  onChange={handleChange('usuario')}
                  required
                  id="input-u-username"
                  autoComplete="off"
                />
                {isCheckingUsername && <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>Verificando disponibilidad...</span>}
                {usernameError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--sys-danger)', fontSize: 12, marginTop: 4 }}>
                    <AlertCircle size={12} /> {usernameError}
                  </div>
                )}
              </div>
            </div>
            <div className="form-grid-2" style={{ marginTop: 12 }}>
              <FormInput
                label="Contraseña"
                id="input-u-pass" // Cambia el id
                type="password"
                // Cambia a 'new-password' para forzar al navegador a entender que es un registro nuevo
                autoComplete="new-password"
                // @ts-ignore
                name="field_b_random"
                value={formData.password}
                onChange={handleChange('password')}
                required
              />
              <FormInput
                label="Confirmar Contraseña"
                placeholder="Repite la contraseña"
                value={formData.confirmarPassword}
                onChange={handleChange('confirmarPassword')}
                type="password"
                required
                id="nu-confirmar-password"
                autoComplete="off"
              />
            </div>
            <div className="card card-context context-info" style={{ padding: '10px 14px', marginTop: 8 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text-muted)' }}>
                El correo de acceso y el nombre de usuario se usarán para crear la cuenta en el sistema.
                La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.
              </p>
            </div>
          </div>

          {/* Botones */}
          <div className="action-bar" style={{ paddingTop: 8, paddingBottom: 24 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={enviando || isCheckingUsername || !!usernameError || !isOnline}
            >
              <UserPlus size={16} />
              {enviando ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>

      <ErrorModal
        isOpen={modalState.error}
        onClose={() => setModalState({ ...modalState, error: false })}
        title="Error"
        message={modalState.errorMessage}
      />
      <SuccessModal
        isOpen={modalState.success}
        onClose={handleSuccessClose}
        title="¡Éxito!"
        message={modalState.successMessage}
      />
    </>
  );
}
