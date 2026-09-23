import { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

const RealtimeContext = createContext({});
export const useRealtime = () => useContext(RealtimeContext);

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const canalIdRef = useRef(`realtime-global-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        if (!user) return;

        const tablasAEscuchar = [
            'orden_servicio', 'peticion_queue', 'clientes',
            'empresa', 'perfil_info', 'contacto', 'auditoria_log',
            'orden_apoyo', 'orden_nota', 'notificaciones',
        ];
        const canalId = canalIdRef.current;
        const canal = supabase.channel(canalId);

        tablasAEscuchar.forEach((tabla) => {
            canal.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: tabla },
                (payload) => {
                    // Cuando una petición de orden_apoyo se completa, disparar
                    // también el evento de orden_apoyo para que los hooks de
                    // realtime hagan refetch (el INSERT real en orden_apoyo ocurre
                    // dentro del trigger, no directamente, por eso necesitamos este puente).
                    //
                    // IMPORTANTE: payload.new aquí es la fila de peticion_queue,
                    // NO la fila real de orden_apoyo. peticion_queue no tiene
                    // columna id_orden_servicio en su raíz — ese dato vive dentro
                    // del jsonb payload.new.payload (lo que mandó el cliente al
                    // encolar: { id_orden_servicio, id_tecnico, notas }).
                    // Por eso se remapea explícitamente antes de reemitir el
                    // evento, para que los hooks que filtran por id_orden_servicio
                    // (p. ej. useApoyo) puedan hacer match correctamente.
                    if (
                        tabla === 'peticion_queue' &&
                        payload.eventType === 'UPDATE' &&
                        payload.new?.estado === 'completado' &&
                        payload.new?.tabla_destino === 'orden_apoyo'
                    ) {
                        const datosApoyo = payload.new?.payload ?? {};
                        window.dispatchEvent(
                            new CustomEvent('data-changed', {
                                detail: {
                                    tabla: 'orden_apoyo',
                                    event: 'INSERT',
                                    new: {
                                        id_orden_servicio: datosApoyo.id_orden_servicio,
                                        id_tecnico: datosApoyo.id_tecnico,
                                        realizado_por: payload.new?.realizado_por,
                                    },
                                    old: null,
                                }
                            })
                        );
                    }

                    // Mismo problema y mismo fix para orden_nota: también se
                    // crea vía peticion_queue (ver política pq_minimo_responsable_insert),
                    // así que su id_orden_servicio real también vive en el jsonb
                    // payload.new.payload, no en la raíz de peticion_queue.
                    if (
                        tabla === 'peticion_queue' &&
                        payload.eventType === 'UPDATE' &&
                        payload.new?.estado === 'completado' &&
                        payload.new?.tabla_destino === 'orden_nota'
                    ) {
                        const datosNota = payload.new?.payload ?? {};
                        window.dispatchEvent(
                            new CustomEvent('data-changed', {
                                detail: {
                                    tabla: 'orden_nota',
                                    event: 'INSERT',
                                    new: {
                                        id_orden_servicio: datosNota.id_orden_servicio,
                                        tipo: datosNota.tipo,
                                        realizado_por: payload.new?.realizado_por,
                                    },
                                    old: null,
                                }
                            })
                        );
                    }

                    // Bridge: cuando el trigger tr_notificar_apoyo_asignado
                    // crea una notificación para el técnico de apoyo, esa
                    // fila de `notificaciones` SÍ llega por Realtime (el usuario
                    // puede leer sus propias notificaciones). Aquí la convertimos
                    // en un evento de orden_apoyo para que useRealtimeOrdenes
                    // haga el refetch y la orden aparezca en la lista del técnico.
                    if (
                        tabla === 'notificaciones' &&
                        payload.eventType === 'INSERT' &&
                        payload.new?.tabla_referencia === 'orden_apoyo'
                    ) {
                        window.dispatchEvent(
                            new CustomEvent('data-changed', {
                                detail: {
                                    tabla: 'orden_apoyo',
                                    event: 'INSERT',
                                    new: { id_referencia: payload.new?.id_referencia },
                                    old: null,
                                }
                            })
                        );
                    }

                    if (
                        tabla === 'peticion_queue' &&
                        payload.eventType === 'UPDATE' &&
                        payload.new?.estado === 'completado' &&
                        payload.new?.tabla_destino === 'cliente_frecuente'
                    ) {
                        window.dispatchEvent(new CustomEvent('refetch-clientes-frecuentes'));
                    }

                    window.dispatchEvent(
                        new CustomEvent('data-changed', {
                            detail: { tabla, event: payload.eventType, new: payload.new, old: payload.old }
                        })
                    );
                }
            );
        });

        canal.subscribe();

        return () => {
            supabase.removeChannel(canal);
        };
    }, [user]);

    return (
        <RealtimeContext.Provider value={{}}>
            {children}
        </RealtimeContext.Provider>
    );
};