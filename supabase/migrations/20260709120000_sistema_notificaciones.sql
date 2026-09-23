-- =====================================================================
-- Migración: Sistema de Notificaciones
-- =====================================================================
-- Objetivo: que cualquier usuario reciba una notificación automática
-- cada vez que su perfil se ve implicado en algo — se le asigna una
-- orden, lo agregan/quitan de un apoyo, cambia el estado o prioridad
-- de una orden suya, se cierra una orden suya, le cambian su rol o
-- sus datos de contacto, o falla una solicitud que él mismo hizo.
--
-- Diseño:
--  1. Se agregan columnas a `notificaciones`: prioridad (reusa el
--     enum prioridad_servicio para pintar colores/urgencia igual que
--     las órdenes), tabla_referencia/id_referencia (para poder
--     navegar al registro relacionado al hacer click) e is_deleted
--     (borrado *suave*: la fila nunca se destruye, solo se oculta de
--     la vista del usuario — así el estado de "leída" siempre queda
--     persistido y no puede "revivir" como nueva).
--  2. RLS: cada usuario solo puede ver/actualizar sus propias
--     notificaciones. Los INSERT los hacen únicamente las funciones
--     SECURITY DEFINER de abajo (el cliente nunca inserta directo).
--  3. Un helper fn_crear_notificacion() centraliza el INSERT y evita
--     auto-notificar al mismo usuario que disparó la acción (usando
--     la variable de sesión app.current_realizado_por que ya setea
--     fn_procesar_peticion en cada petición).
--  4. Triggers AFTER en las tablas reales (orden_servicio, orden_apoyo,
--     orden_nota, cierre_orden, perfil_info, contacto) — así funciona
--     sin importar si el cambio vino de la cola de peticiones o de
--     cualquier otro camino futuro.
--  5. Se modifica fn_procesar_peticion para notificar al propio autor
--     cuando su solicitud termina en estado 'fallido'.
-- =====================================================================

-- ==========================================
-- 1. Columnas nuevas en notificaciones
-- ==========================================
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS prioridad public.prioridad_servicio,
  ADD COLUMN IF NOT EXISTS tabla_referencia text,
  ADD COLUMN IF NOT EXISTS id_referencia uuid,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_activas
  ON public.notificaciones (id_usuario, is_deleted, is_read, created DESC);

ALTER TABLE public.notificaciones REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END $$;

-- ==========================================
-- 2. RLS — cada quien ve y actualiza solo lo suyo
-- ==========================================
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_propia_select ON public.notificaciones;
CREATE POLICY notif_propia_select ON public.notificaciones
FOR SELECT TO authenticated
USING (id_usuario = fn_perfil_actual());

-- Update: solo para marcar leída/completada/eliminada (is_deleted), nunca
-- para tocar título, descripción, tipo, etc.
DROP POLICY IF EXISTS notif_propia_update ON public.notificaciones;
CREATE POLICY notif_propia_update ON public.notificaciones
FOR UPDATE TO authenticated
USING (id_usuario = fn_perfil_actual())
WITH CHECK (id_usuario = fn_perfil_actual());

-- No hay policy de INSERT ni DELETE para 'authenticated': las notificaciones
-- solo las crean las funciones SECURITY DEFINER de abajo, y el "borrado"
-- siempre es suave (UPDATE is_deleted = true), nunca un DELETE real.

-- ==========================================
-- 3. Helper central para crear notificaciones
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_crear_notificacion(
    p_id_usuario        uuid,
    p_titulo            text,
    p_descripcion       text,
    p_tipo              text DEFAULT 'info',
    p_prioridad         text DEFAULT NULL,
    p_tabla_referencia  text DEFAULT NULL,
    p_id_referencia     uuid DEFAULT NULL,
    p_evitar_actor      boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor text;
BEGIN
    IF p_id_usuario IS NULL THEN
        RETURN;
    END IF;

    -- No molestar al usuario con notificaciones de sus propias acciones,
    -- excepto cuando el propio llamador lo pide explícitamente (p.ej. avisos
    -- de error, donde el autor SIEMPRE debe enterarse).
    v_actor := NULLIF(current_setting('app.current_realizado_por', true), '');
    IF p_evitar_actor AND v_actor IS NOT NULL AND v_actor = p_id_usuario::text THEN
        RETURN;
    END IF;

    INSERT INTO public.notificaciones (
        id_usuario, titulo, descripcion, tipo, prioridad, tabla_referencia, id_referencia
    ) VALUES (
        p_id_usuario, p_titulo, p_descripcion, p_tipo,
        NULLIF(p_prioridad, '')::public.prioridad_servicio,
        p_tabla_referencia, p_id_referencia
    );
END;
$$;

-- ==========================================
-- 4a. orden_servicio — creación / reasignación / cambio de estado
--     o prioridad / edición general
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_notificar_orden_servicio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_titulo text;
    v_desc   text;
    v_tipo_estado text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.responsable IS NOT NULL THEN
            PERFORM public.fn_crear_notificacion(
                NEW.responsable,
                'Nueva orden asignada',
                format('Se te asignó la orden #%s%s.', NEW.numero_orden,
                       CASE WHEN NEW.equipo IS NOT NULL THEN ' — ' || NEW.equipo ELSE '' END),
                CASE WHEN NEW.prioridad::text = 'urgente' THEN 'alert' ELSE 'info' END,
                NEW.prioridad::text,
                'orden_servicio', NEW.id_orden_servicio
            );
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN

        -- Cambio de responsable (reasignación)
        IF NEW.responsable IS DISTINCT FROM OLD.responsable THEN
            IF NEW.responsable IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    NEW.responsable,
                    'Se te asignó una orden',
                    format('Ahora eres responsable de la orden #%s.', NEW.numero_orden),
                    CASE WHEN NEW.prioridad::text = 'urgente' THEN 'alert' ELSE 'info' END,
                    NEW.prioridad::text,
                    'orden_servicio', NEW.id_orden_servicio
                );
            END IF;
            IF OLD.responsable IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    OLD.responsable,
                    'Ya no eres responsable de una orden',
                    format('Se te removió como responsable de la orden #%s.', NEW.numero_orden),
                    'info', NULL, 'orden_servicio', NEW.id_orden_servicio
                );
            END IF;
        END IF;

        -- Prioridad escaló a urgente
        IF NEW.prioridad IS DISTINCT FROM OLD.prioridad
           AND NEW.prioridad::text = 'urgente'
           AND NEW.responsable IS NOT NULL THEN
            PERFORM public.fn_crear_notificacion(
                NEW.responsable,
                '¡Orden marcada como urgente!',
                format('La orden #%s ahora tiene prioridad urgente.', NEW.numero_orden),
                'alert', 'urgente', 'orden_servicio', NEW.id_orden_servicio
            );
        END IF;

        -- Cambio de estado
        IF NEW.estado IS DISTINCT FROM OLD.estado THEN
            v_titulo := CASE NEW.estado::text
                WHEN 'en proceso' THEN 'Orden en proceso'
                WHEN 'finalizado' THEN 'Orden finalizada'
                ELSE 'Estado de orden actualizado'
            END;
            v_desc := format('La orden #%s cambió a estado "%s".', NEW.numero_orden, NEW.estado::text);
            v_tipo_estado := CASE NEW.estado::text WHEN 'finalizado' THEN 'success' ELSE 'info' END;

            IF NEW.responsable IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    NEW.responsable, v_titulo, v_desc, v_tipo_estado,
                    NEW.prioridad::text, 'orden_servicio', NEW.id_orden_servicio
                );
            END IF;
            IF NEW.realizado_por IS NOT NULL AND NEW.realizado_por IS DISTINCT FROM NEW.responsable THEN
                PERFORM public.fn_crear_notificacion(
                    NEW.realizado_por, v_titulo, v_desc, v_tipo_estado,
                    NEW.prioridad::text, 'orden_servicio', NEW.id_orden_servicio
                );
            END IF;
        END IF;

        -- Edición general de datos (si no fue ya cubierta arriba)
        IF NEW.responsable IS NOT NULL
           AND NEW.responsable IS NOT DISTINCT FROM OLD.responsable
           AND NEW.estado IS NOT DISTINCT FROM OLD.estado
           AND (
                NEW.problema IS DISTINCT FROM OLD.problema OR
                NEW.equipo IS DISTINCT FROM OLD.equipo OR
                NEW.observaciones IS DISTINCT FROM OLD.observaciones OR
                NEW.actividad IS DISTINCT FROM OLD.actividad
           ) THEN
            PERFORM public.fn_crear_notificacion(
                NEW.responsable,
                'Orden actualizada',
                format('Se modificaron datos de la orden #%s.', NEW.numero_orden),
                'warning', NEW.prioridad::text, 'orden_servicio', NEW.id_orden_servicio
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_orden_servicio ON public.orden_servicio;
CREATE TRIGGER trg_notificar_orden_servicio
AFTER INSERT OR UPDATE ON public.orden_servicio
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_orden_servicio();

-- ==========================================
-- 4b. orden_apoyo — te agregan / te quitan como apoyo
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_notificar_orden_apoyo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_numero integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT numero_orden INTO v_numero
        FROM public.orden_servicio WHERE id_orden_servicio = NEW.id_orden_servicio;

        PERFORM public.fn_crear_notificacion(
            NEW.id_tecnico,
            'Te agregaron como apoyo',
            format('Fuiste asignado como técnico de apoyo en la orden #%s.', v_numero),
            'info', NULL, 'orden_servicio', NEW.id_orden_servicio
        );
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        SELECT numero_orden INTO v_numero
        FROM public.orden_servicio WHERE id_orden_servicio = OLD.id_orden_servicio;

        PERFORM public.fn_crear_notificacion(
            OLD.id_tecnico,
            'Te removieron de un apoyo',
            format('Ya no eres técnico de apoyo en la orden #%s.', v_numero),
            'warning', NULL, 'orden_servicio', OLD.id_orden_servicio
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_orden_apoyo ON public.orden_apoyo;
CREATE TRIGGER trg_notificar_orden_apoyo
AFTER INSERT OR DELETE ON public.orden_apoyo
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_orden_apoyo();

-- ==========================================
-- 4c. orden_nota — notas nuevas (traspaso/apoyo ya se cubren con los
--     triggers de arriba, aquí solo observaciones y cierre)
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_notificar_orden_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orden record;
BEGIN
    IF NEW.tipo::text IN ('traspaso', 'apoyo') THEN
        RETURN NEW;
    END IF;

    SELECT numero_orden, responsable INTO v_orden
    FROM public.orden_servicio WHERE id_orden_servicio = NEW.id_orden_servicio;

    IF v_orden.responsable IS NOT NULL THEN
        PERFORM public.fn_crear_notificacion(
            v_orden.responsable,
            'Nueva nota en tu orden',
            format('Orden #%s: %s', v_orden.numero_orden, left(NEW.nota, 140)),
            'info', NULL, 'orden_servicio', NEW.id_orden_servicio
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_orden_nota ON public.orden_nota;
CREATE TRIGGER trg_notificar_orden_nota
AFTER INSERT ON public.orden_nota
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_orden_nota();

-- ==========================================
-- 4d. cierre_orden — orden cerrada
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_notificar_cierre_orden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orden record;
BEGIN
    SELECT numero_orden, responsable, realizado_por INTO v_orden
    FROM public.orden_servicio WHERE id_orden_servicio = NEW.id_orden_servicio;

    IF v_orden.responsable IS NOT NULL THEN
        PERFORM public.fn_crear_notificacion(
            v_orden.responsable, 'Orden cerrada',
            format('La orden #%s fue cerrada.', v_orden.numero_orden),
            'success', NULL, 'orden_servicio', NEW.id_orden_servicio
        );
    END IF;
    IF v_orden.realizado_por IS NOT NULL AND v_orden.realizado_por IS DISTINCT FROM v_orden.responsable THEN
        PERFORM public.fn_crear_notificacion(
            v_orden.realizado_por, 'Orden cerrada',
            format('La orden #%s fue cerrada.', v_orden.numero_orden),
            'success', NULL, 'orden_servicio', NEW.id_orden_servicio
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_cierre_orden ON public.cierre_orden;
CREATE TRIGGER trg_notificar_cierre_orden
AFTER INSERT ON public.cierre_orden
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_cierre_orden();

-- ==========================================
-- 4e. perfil_info — cambio de rol / datos personales
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_notificar_perfil_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.rol IS DISTINCT FROM OLD.rol THEN
        PERFORM public.fn_crear_notificacion(
            NEW.id_perfil_info,
            'Tu rol de usuario cambió',
            format('Tu rol ahora es "%s".', NEW.rol::text),
            'warning', 'alto', 'perfil_info', NEW.id_perfil_info
        );
    ELSIF NEW.nombres IS DISTINCT FROM OLD.nombres
       OR NEW.apellido_paterno IS DISTINCT FROM OLD.apellido_paterno
       OR NEW.apellido_materno IS DISTINCT FROM OLD.apellido_materno
       OR NEW.usuario IS DISTINCT FROM OLD.usuario THEN
        PERFORM public.fn_crear_notificacion(
            NEW.id_perfil_info,
            'Tu perfil fue actualizado',
            'Se modificaron tus datos personales.',
            'info', NULL, 'perfil_info', NEW.id_perfil_info
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_perfil_info ON public.perfil_info;
CREATE TRIGGER trg_notificar_perfil_info
AFTER UPDATE ON public.perfil_info
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_perfil_info();

-- ==========================================
-- 4f. contacto — cambio de datos de contacto
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_notificar_contacto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.telefono IS DISTINCT FROM OLD.telefono
       OR NEW.lada IS DISTINCT FROM OLD.lada
       OR NEW.direccion IS DISTINCT FROM OLD.direccion
       OR NEW.correo_personal IS DISTINCT FROM OLD.correo_personal THEN
        PERFORM public.fn_crear_notificacion(
            NEW.id_perfil_info,
            'Tu información de contacto cambió',
            'Se actualizaron tus datos de contacto.',
            'info', NULL, 'contacto', NEW.id_perfil_info
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_contacto ON public.contacto;
CREATE TRIGGER trg_notificar_contacto
AFTER UPDATE ON public.contacto
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_contacto();

-- ==========================================
-- 5. fn_procesar_peticion — avisar al autor cuando su solicitud falla
--    (se reemplaza completa: mismo cuerpo que 20260708, agregando el
--    aviso dentro del bloque EXCEPTION)
-- ==========================================
CREATE OR REPLACE FUNCTION public.fn_procesar_peticion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_query                   text;
    v_pk_col                  text;
    v_key                     text;
    v_val                     text;
    v_jval                    jsonb;
    v_set_parts               text[] := '{}';
    v_cols                    text[] := '{}';
    v_vals                    text[] := '{}';
    v_es_correccion           boolean;
    v_datos_actuales_cli      public.clientes%ROWTYPE;
    v_datos_actuales_emp      public.empresa%ROWTYPE;
    v_id_empresa_nueva        uuid;
    v_nuevo_id_cliente        uuid;
BEGIN
    IF NEW.estado = 'procesando' AND OLD.estado != 'procesando' THEN
        BEGIN
            PERFORM set_config('app.current_realizado_por', COALESCE(NEW.realizado_por::text, ''), true);

            v_pk_col := CASE NEW.tabla_destino::text
                WHEN 'perfil_info'    THEN 'id_perfil_info'
                WHEN 'contacto'       THEN 'id_perfil_info'
                WHEN 'clientes'       THEN 'id_cliente'
                WHEN 'empresa'        THEN 'id_empresa'
                WHEN 'orden_servicio' THEN 'id_orden_servicio'
                WHEN 'cierre_orden'   THEN 'id_cierre'
                WHEN 'orden_apoyo'    THEN 'id_apoyo'
                WHEN 'orden_nota'     THEN 'id_nota'
                ELSE NULL
            END;

            IF v_pk_col IS NULL THEN
                RAISE EXCEPTION 'tabla_destino no reconocida: %', NEW.tabla_destino;
            END IF;

            -- ── INSERT ──────────────────────────────────────────────────────
            IF NEW.operacion::text = 'insert' THEN

                FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(NEW.payload) LOOP
                    CONTINUE WHEN v_val IS NULL;
                    CONTINUE WHEN v_val = 'null';
                    CONTINUE WHEN v_key = 'estado';
                    CONTINUE WHEN v_key = 'search_vector';  -- columna GENERATED
                    CONTINUE WHEN v_key = 'numero_orden';   -- columna IDENTITY
                    v_cols := array_append(v_cols, quote_ident(v_key));
                    v_vals := array_append(v_vals, quote_nullable(v_val));
                END LOOP;

                IF array_length(v_cols, 1) IS NULL THEN
                    RAISE EXCEPTION 'El payload no tiene campos válidos para insertar';
                END IF;

                v_query := format(
                    'INSERT INTO public.%I (%s) VALUES (%s)',
                    NEW.tabla_destino::text,
                    array_to_string(v_cols, ', '),
                    array_to_string(v_vals, ', ')
                );
                EXECUTE v_query;

            -- ── UPDATE / CORRECCIÓN ─────────────────────────────────────────
            ELSIF NEW.operacion::text IN ('update', 'correccion') THEN

                IF NEW.id_registro IS NULL THEN
                    RAISE EXCEPTION 'La operación % requiere un id_registro', NEW.operacion;
                END IF;

                -- Protección: orden_nota es inmutable
                IF NEW.tabla_destino::text = 'orden_nota' THEN
                    RAISE EXCEPTION 'Las notas de orden son inmutables y no pueden modificarse';
                END IF;

                -- ── Versionado clientes ──────────────────────────────────────
                IF NEW.tabla_destino::text = 'clientes' THEN

                    v_es_correccion := COALESCE(
                        (NEW.payload->>'es_correccion')::boolean,
                        NEW.operacion::text = 'correccion'
                    );

                    SELECT * INTO v_datos_actuales_cli
                    FROM public.clientes
                    WHERE id_cliente = NEW.id_registro;

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'No se encontró cliente con id %', NEW.id_registro;
                    END IF;

                    v_id_empresa_nueva := CASE
                        WHEN NEW.payload ? 'id_empresa' AND NEW.payload->'id_empresa' = 'null'::jsonb THEN NULL
                        WHEN NEW.payload ? 'id_empresa' THEN (NEW.payload->>'id_empresa')::uuid
                        ELSE v_datos_actuales_cli.id_empresa
                    END;

                    IF v_es_correccion THEN
                        UPDATE public.clientes SET
                            id_empresa    = v_id_empresa_nueva,
                            nombre        = COALESCE(NEW.payload->>'nombre',    v_datos_actuales_cli.nombre),
                            direccion     = COALESCE(NEW.payload->>'direccion', v_datos_actuales_cli.direccion),
                            correo        = COALESCE(NEW.payload->>'correo',    v_datos_actuales_cli.correo),
                            lada          = COALESCE(NEW.payload->>'lada',      v_datos_actuales_cli.lada),
                            telefono      = COALESCE(NEW.payload->>'telefono',  v_datos_actuales_cli.telefono),
                            motivo_cambio = NEW.motivo_cambio,
                            editado_por   = NEW.realizado_por,
                            es_correccion = true
                        WHERE id_cliente = NEW.id_registro;
                    ELSE
                        UPDATE public.clientes
                        SET es_actual = false
                        WHERE id_cliente = NEW.id_registro;

                        INSERT INTO public.clientes (
                            id_raiz, version, es_actual, es_correccion,
                            id_empresa, nombre, direccion, correo, lada, telefono,
                            motivo_cambio, editado_por
                        ) VALUES (
                            v_datos_actuales_cli.id_raiz,
                            v_datos_actuales_cli.version + 1,
                            true, false,
                            v_id_empresa_nueva,
                            COALESCE(NEW.payload->>'nombre',    v_datos_actuales_cli.nombre),
                            COALESCE(NEW.payload->>'direccion', v_datos_actuales_cli.direccion),
                            COALESCE(NEW.payload->>'correo',    v_datos_actuales_cli.correo),
                            COALESCE(NEW.payload->>'lada',      v_datos_actuales_cli.lada),
                            COALESCE(NEW.payload->>'telefono',  v_datos_actuales_cli.telefono),
                            NEW.motivo_cambio,
                            NEW.realizado_por
                        ) RETURNING id_cliente INTO v_nuevo_id_cliente;

                        UPDATE public.orden_servicio
                        SET id_clientes = v_nuevo_id_cliente
                        WHERE id_clientes = NEW.id_registro
                          AND estado IN ('pendiente', 'en proceso');
                    END IF;

                -- ── Versionado empresa ───────────────────────────────────────
                ELSIF NEW.tabla_destino::text = 'empresa' THEN

                    v_es_correccion := COALESCE(
                        (NEW.payload->>'es_correccion')::boolean,
                        NEW.operacion::text = 'correccion'
                    );

                    SELECT * INTO v_datos_actuales_emp
                    FROM public.empresa
                    WHERE id_empresa = NEW.id_registro;

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'No se encontró empresa con id %', NEW.id_registro;
                    END IF;

                    IF v_es_correccion THEN
                        UPDATE public.empresa SET
                            nombre        = COALESCE(NEW.payload->>'nombre',    v_datos_actuales_emp.nombre),
                            direccion     = COALESCE(NEW.payload->>'direccion', v_datos_actuales_emp.direccion),
                            correo        = COALESCE(NEW.payload->>'correo',    v_datos_actuales_emp.correo),
                            lada          = COALESCE(NEW.payload->>'lada',      v_datos_actuales_emp.lada),
                            telefono      = COALESCE(NEW.payload->>'telefono',  v_datos_actuales_emp.telefono),
                            motivo_cambio = NEW.motivo_cambio,
                            editado_por   = NEW.realizado_por,
                            es_correccion = true
                        WHERE id_empresa = NEW.id_registro;
                    ELSE
                        UPDATE public.empresa
                        SET es_actual = false
                        WHERE id_empresa = NEW.id_registro;

                        INSERT INTO public.empresa (
                            id_raiz, version, es_actual, es_correccion,
                            nombre, direccion, correo, lada, telefono,
                            motivo_cambio, editado_por
                        ) VALUES (
                            v_datos_actuales_emp.id_raiz,
                            v_datos_actuales_emp.version + 1,
                            true, false,
                            COALESCE(NEW.payload->>'nombre',    v_datos_actuales_emp.nombre),
                            COALESCE(NEW.payload->>'direccion', v_datos_actuales_emp.direccion),
                            COALESCE(NEW.payload->>'correo',    v_datos_actuales_emp.correo),
                            COALESCE(NEW.payload->>'lada',      v_datos_actuales_emp.lada),
                            COALESCE(NEW.payload->>'telefono',  v_datos_actuales_emp.telefono),
                            NEW.motivo_cambio,
                            NEW.realizado_por
                        );
                    END IF;

                -- ── UPDATE genérico (resto de tablas) ───────────────────────
                ELSE

                    FOR v_key IN SELECT key FROM jsonb_each(NEW.payload) LOOP
                        v_jval := NEW.payload -> v_key;

                        -- Campos protegidos que nunca se tocan en UPDATE genérico
                        CONTINUE WHEN v_key = 'observaciones_finales';
                        CONTINUE WHEN v_key = 'search_vector';
                        CONTINUE WHEN v_key = 'numero_orden';

                        -- estado solo se acepta en orden_servicio con valores válidos
                        IF v_key = 'estado' AND NOT (
                            NEW.tabla_destino::text = 'orden_servicio'
                            AND (v_jval #>> '{}') IN ('finalizado', 'en proceso', 'pendiente')
                        ) THEN
                            CONTINUE;
                        END IF;

                        -- Campos uuid nulos que permiten desvinculación explícita
                        IF v_jval IS NULL OR v_jval = 'null'::jsonb THEN
                            IF v_key IN ('id_cliente', 'id_empresa', 'responsable', 'id_apoyo') THEN
                                v_set_parts := array_append(v_set_parts,
                                    format('%I = NULL', v_key));
                            END IF;
                            CONTINUE;
                        END IF;

                        -- Cast según tipo de columna
                        IF v_key = 'finalized_at' THEN
                            v_set_parts := array_append(v_set_parts,
                                format('%I = %L::timestamptz', v_key, v_jval #>> '{}'));

                        ELSIF v_key IN (
                            'responsable',    'id_cliente',      'id_empresa',
                            'realizado_por',  'id_orden_servicio','id_tecnico',
                            'asignado_por',   'creado_por',       'responsable_antes',
                            'responsable_despues', 'id_apoyo',   'cerrado_por',
                            'editado_por'
                        ) THEN
                            v_set_parts := array_append(v_set_parts,
                                format('%I = %L::uuid', v_key, v_jval #>> '{}'));

                        ELSIF v_key IN ('activo', 'es_actual', 'es_correccion') THEN
                            v_set_parts := array_append(v_set_parts,
                                format('%I = %L::boolean', v_key, v_jval #>> '{}'));

                        ELSE
                            v_set_parts := array_append(v_set_parts,
                                format('%I = %L', v_key, v_jval #>> '{}'));
                        END IF;

                    END LOOP;

                    IF array_length(v_set_parts, 1) IS NULL THEN
                        RAISE EXCEPTION 'El payload no tiene campos válidos para actualizar';
                    END IF;

                    v_query := format(
                        'UPDATE public.%I SET %s WHERE %I = %L::uuid',
                        NEW.tabla_destino::text,
                        array_to_string(v_set_parts, ', '),
                        v_pk_col,
                        NEW.id_registro::text
                    );
                    EXECUTE v_query;

                    -- Cierre automático al finalizar orden
                    IF NEW.tabla_destino::text = 'orden_servicio'
                       AND (NEW.payload->>'estado') = 'finalizado' THEN

                        INSERT INTO public.cierre_orden (
                            id_orden_servicio,
                            cerrado_por,
                            finalized_at,
                            observaciones_finales
                        ) VALUES (
                            NEW.id_registro,
                            NEW.realizado_por,
                            COALESCE((NEW.payload->>'finalized_at')::timestamptz, now()),
                            NULLIF(NEW.payload->>'observaciones_finales', '')
                        )
                        ON CONFLICT (id_orden_servicio) DO UPDATE SET
                            cerrado_por           = EXCLUDED.cerrado_por,
                            finalized_at          = EXCLUDED.finalized_at,
                            observaciones_finales = EXCLUDED.observaciones_finales;

                    END IF;

                END IF;

            -- ── DELETE ──────────────────────────────────────────────────────
            ELSIF NEW.operacion::text = 'delete' THEN

                IF NEW.id_registro IS NULL THEN
                    RAISE EXCEPTION 'La operación DELETE requiere un id_registro';
                END IF;

                -- Protección: orden_nota es inmutable
                IF NEW.tabla_destino::text = 'orden_nota' THEN
                    RAISE EXCEPTION 'Las notas de orden son inmutables y no pueden eliminarse';
                END IF;

                v_query := format(
                    'DELETE FROM public.%I WHERE %I = %L::uuid',
                    NEW.tabla_destino::text,
                    v_pk_col,
                    NEW.id_registro::text
                );
                EXECUTE v_query;

            ELSE
                RAISE EXCEPTION 'Operación no soportada: %', NEW.operacion;
            END IF;

            NEW.estado       := 'completado';
            NEW.procesado_at := now();
            NEW.intentos     := NEW.intentos + 1;

        EXCEPTION WHEN OTHERS THEN
            NEW.estado        := 'fallido';
            NEW.error_detalle := SQLERRM || ' | SQL: ' || COALESCE(v_query, 'NULL');
            NEW.intentos      := NEW.intentos + 1;

            -- Avisar siempre al autor de la solicitud, aunque la notificación
            -- normal evite auto-notificarse (por eso p_evitar_actor = false).
            IF NEW.realizado_por IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    NEW.realizado_por,
                    'No se pudo completar tu solicitud',
                    format('Falló "%s" sobre "%s": %s', NEW.operacion::text, NEW.tabla_destino::text, left(SQLERRM, 180)),
                    'alert', 'urgente', 'peticion_queue', NEW.id_peticion,
                    false
                );
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$function$;
