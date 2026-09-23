-- =================================================================
-- Realtime para apoyo: trigger que notifica al técnico recién asignado
-- =================================================================
-- Problema: los INSERTs en orden_apoyo los hace fn_procesar_peticion
-- (trigger AFTER UPDATE en peticion_queue), y los triggers del servidor
-- no emiten eventos de Supabase Realtime. El técnico de apoyo tampoco
-- puede leer la fila de peticion_queue del usuario que lo asignó
-- (RLS: realizado_por = auth.uid()). Por eso nunca recibía el evento.
--
-- Solución: un trigger AFTER INSERT en orden_apoyo que llama a
-- fn_crear_notificacion para el id_tecnico. La tabla notificaciones
-- SÍ está en supabase_realtime y el usuario puede ver sus propias
-- notificaciones, por lo que el evento llega al frontend.
-- El frontend escucha notificaciones con tabla_referencia='orden_apoyo'
-- y dispara un refetch de órdenes.
-- =================================================================

CREATE OR REPLACE FUNCTION public.fn_notificar_apoyo_asignado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Notificar al técnico de apoyo recién añadido
    IF NEW.id_tecnico IS NOT NULL THEN
        PERFORM public.fn_crear_notificacion(
            NEW.id_tecnico,
            'Te asignaron como técnico de apoyo',
            format(
                'Fuiste añadido como apoyo en la orden de servicio #%s.',
                (SELECT numero_orden FROM public.orden_servicio WHERE id_orden_servicio = NEW.id_orden_servicio)
            ),
            'info',
            NULL,
            'orden_apoyo',
            NEW.id_apoyo,
            false
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Crear (o recrear) el trigger
DROP TRIGGER IF EXISTS tr_notificar_apoyo_asignado ON public.orden_apoyo;

CREATE TRIGGER tr_notificar_apoyo_asignado
    AFTER INSERT ON public.orden_apoyo
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_notificar_apoyo_asignado();
