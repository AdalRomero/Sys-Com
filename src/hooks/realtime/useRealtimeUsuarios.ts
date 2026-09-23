import { useEffect } from 'react';
import type { Usuario } from '../../types';

interface OpcionesConsulta {
    filtroRol?: string;
    filtroCredenciales?: string;
    debouncedBusqueda?: string;
}

export function useRealtimeUsuarios(
    setListaUsuarios: React.Dispatch<React.SetStateAction<Usuario[]>>,
    opciones: OpcionesConsulta = {}
) {
    const { filtroRol = '', filtroCredenciales = '', debouncedBusqueda = '' } = opciones;

    useEffect(() => {
        const listener = (e: Event) => {
            const { tabla, event, new: nuevo, old } = (e as CustomEvent).detail;

            // ── perfil_info ──────────────────────────────────────────────────
            if (tabla === 'perfil_info') {
                if (event === 'INSERT') {
                    const pasaRol = !filtroRol || nuevo.rol === filtroRol;
                    const pasaCredenciales =
                        !filtroCredenciales ||
                        (filtroCredenciales === 'activo' && nuevo.auth_usuario !== null) ||
                        (filtroCredenciales === 'inactivo' && nuevo.auth_usuario === null);
                    const pasaBusqueda =
                        !debouncedBusqueda ||
                        [nuevo.nombres, nuevo.apellido_paterno, nuevo.apellido_materno, nuevo.usuario]
                            .some(c => c?.toLowerCase().includes(debouncedBusqueda.toLowerCase()));

                    if (pasaRol && pasaCredenciales && pasaBusqueda) {
                        // Llega sin join de contacto — se agrega con contacto vacío
                        setListaUsuarios(prev => [{ ...nuevo, contacto: undefined }, ...prev]);
                    }
                }

                if (event === 'UPDATE') {
                    setListaUsuarios(prev =>
                        prev.map(u =>
                            u.id_perfil_info === nuevo.id_perfil_info
                                ? { ...u, ...nuevo }   // preserva u.contacto ya cargado
                                : u
                        )
                    );
                }

                if (event === 'DELETE') {
                    setListaUsuarios(prev =>
                        prev.filter(u => u.id_perfil_info !== old.id_perfil_info)
                    );
                }
            }

            // ── contacto (relación 1-a-1 con perfil_info) ───────────────────
            // contacto nunca crea/elimina usuarios, solo actualiza sus datos
            if (tabla === 'contacto') {
                if (event === 'INSERT' || event === 'UPDATE') {
                    setListaUsuarios(prev =>
                        prev.map(u =>
                            u.id_perfil_info === nuevo.id_perfil_info
                                ? {
                                    ...u,
                                    contacto: {
                                        ...(u.contacto ?? {}),
                                        lada: nuevo.lada,
                                        telefono: nuevo.telefono,
                                        direccion: nuevo.direccion,
                                        correo_personal: nuevo.correo_personal,
                                    },
                                }
                                : u
                        )
                    );
                }

                if (event === 'DELETE') {
                    setListaUsuarios(prev =>
                        prev.map(u =>
                            u.id_perfil_info === old.id_perfil_info
                                ? { ...u, contacto: undefined }
                                : u
                        )
                    );
                }
            }
        };

        window.addEventListener('data-changed', listener);
        return () => window.removeEventListener('data-changed', listener);

        // Se re-registra si cambian filtros para que INSERT valide correctamente
    }, [filtroRol, filtroCredenciales, debouncedBusqueda, setListaUsuarios]);
}
