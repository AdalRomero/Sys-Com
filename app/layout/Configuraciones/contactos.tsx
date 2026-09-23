import { useState } from 'react';
import { Phone, Mail, Send } from 'lucide-react';
import Header from '../../components/Header';
import FormInput from '../../components/FormInput';
import FormTextarea from '../../components/FormTextarea';
import SuccessModal from '../../components/modals/SuccessModal';
import ErrorModal from '../../components/modals/ErrorModal';
import { enviarCorreo } from '../../../src/service/email.service';

import {
    construirPlantillaBase,
    bloqueDestacado,
    bloqueTexto,
    notaSecundaria,
} from '../../../src/hooks/emailLayout';

interface Contacto {
    nombre: string;
    puesto: string;
    telefono: string;
    correo: string;
}

const CONTACTOS: Contacto[] = [
    { nombre: 'Usuario Ejemplo 1', puesto: 'Soporte Técnico', telefono: '+52 000 000 0000', correo: 'usuario1@ejemplo.com' },
    { nombre: 'Usuario Ejemplo 2', puesto: 'Soporte Técnico', telefono: '+52 000 000 0000', correo: 'usuario2@ejemplo.com' },
    { nombre: 'Usuario Ejemplo 3', puesto: 'Soporte Técnico', telefono: '+52 000 000 0000', correo: 'usuario3@ejemplo.com' },
    { nombre: 'Usuario Ejemplo 4', puesto: 'Soporte Técnico', telefono: '+52 000 000 0000', correo: 'usuario4@ejemplo.com' },
];

const iniciales = (nombre: string) =>
    nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export default function Contactos() {
    const [formData, setFormData] = useState({ nombre: '', mensaje: '' });
    const [enviando, setEnviando] = useState(false);
    const [modalState, setModalState] = useState({ success: false, error: false, errorMessage: '' });

    const handleChange = (field: keyof typeof formData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (enviando) return;

        if (!formData.nombre.trim() || !formData.mensaje.trim()) {
            setModalState({ ...modalState, error: true, errorMessage: 'Completa nombre y mensaje.' });
            return;
        }

        setEnviando(true);

        const cuerpoHtml = `
      ${bloqueDestacado('Alguien te dejó un mensaje desde el formulario de contacto de Syscom:')}
      ${bloqueTexto('Nombre', formData.nombre)}
      ${bloqueTexto('Mensaje', formData.mensaje)}
      ${notaSecundaria('Este aviso lo envía el Bot de Syscom desde el formulario de contacto.')}
    `;

        const res = await enviarCorreo({
            destino: CONTACTOS.map((c) => c.correo),
            asunto: `📩 Nuevo mensaje de contacto — ${formData.nombre}`,
            mensaje: construirPlantillaBase({
                tituloInterno: 'Nuevo mensaje de contacto',
                cuerpoHtml,
                colorAcento: '#2563eb',
            }),
        });

        setEnviando(false);

        if (res.ok) {
            setFormData({ nombre: '', mensaje: '' });
            setModalState({ ...modalState, success: true });
        } else {
            setModalState({ ...modalState, error: true, errorMessage: res.error || 'No se pudo enviar el aviso.' });
        }
    };

    return (
        <>
            <Header title="Contactos" />
            <div className="app-content">
                <div className="page-heading">
                    <div>
                        <h1>Contactos</h1>
                        <p>¿Necesitas ayuda o quieres reportar algo? Aquí está nuestro equipo.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ alignItems: 'stretch' }}>
                    {/* ── Izquierda: lista de contactos ── */}
                    <div className="flex flex-col gap-4 h-full" style={{ justifyContent: 'space-between' }}>
                        {CONTACTOS.map((c) => (
                            <div key={c.correo} className="card p-4 flex items-center gap-4">
                                <div
                                    className="flex items-center justify-center"
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: '9999px',
                                        background: 'var(--sys-primary-light)',
                                        color: 'var(--sys-primary)',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}
                                >
                                    {iniciales(c.nombre)}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--sys-text-dark)' }}>{c.nombre}</div>
                                    <div style={{ fontSize: 13, color: 'var(--sys-text-muted)', marginBottom: 4 }}>{c.puesto}</div>
                                    <div className="flex items-center gap-3" style={{ fontSize: 13 }}>
                                        <a href={`mailto:${c.correo}`} className="flex items-center gap-1" style={{ color: 'var(--sys-primary)' }}>
                                            <Mail size={14} /> {c.correo}
                                        </a>
                                    </div>
                                    <a href={`tel:${c.telefono.replace(/\s+/g, '')}`} className="flex items-center gap-1" style={{ color: 'var(--sys-primary)' }}>
                                        <Phone size={14} /> {c.telefono}
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Derecha: formulario de contacto ── */}
                    <div className="card p-6 h-full flex flex-col">
                        <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                            <div
                                className="flex items-center justify-center"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: '9999px',
                                    background: 'var(--sys-primary-light)',
                                    color: 'var(--sys-primary)',
                                    flexShrink: 0,
                                }}
                            >
                                <Send size={18} />
                            </div>
                            <div>
                                <h2 style={{ fontWeight: 600, color: 'var(--sys-text-dark)' }}>Mandar un aviso</h2>
                                <p style={{ fontSize: 13, color: 'var(--sys-text-muted)' }}>
                                    Le llega por correo a los 4 contactos de la izquierda.
                                </p>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--sys-border)', margin: '0 0 20px' }} />

                        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-5">
                            <FormInput
                                label="Tu nombre"
                                required
                                value={formData.nombre}
                                onChange={(v) => handleChange('nombre', v)}
                            />

                            <FormTextarea
                                label="Mensaje"
                                required
                                rows={8}
                                value={formData.mensaje}
                                onChange={(v) => handleChange('mensaje', v)}
                                style={{ minHeight: 220, resize: 'vertical', fontSize: 15, lineHeight: 1.5 }}
                            />

                            <div style={{ marginTop: 'auto' }}>
                                <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginBottom: 12 }}>
                                    Te responderemos en cuanto alguien del equipo lo revise.
                                </p>
                                <button type="submit" className="btn btn-primary" disabled={enviando} style={{ width: '100%' }}>
                                    <Send size={16} /> {enviando ? 'Enviando…' : 'Enviar aviso'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <SuccessModal
                isOpen={modalState.success}
                onClose={() => setModalState({ ...modalState, success: false })}
                title="Mensaje enviado"
                message="Tu aviso ya está en camino, te responderemos pronto."
            />
            <ErrorModal
                isOpen={modalState.error}
                onClose={() => setModalState({ ...modalState, error: false })}
                title="No se pudo enviar"
                message={modalState.errorMessage}
            />
        </>
    );
}