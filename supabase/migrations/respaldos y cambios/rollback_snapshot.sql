-- ============================================================
--  ROLLBACK SNAPSHOT — Syscom DB
--  Fecha captura : 2026-07-29
--  Proyecto      : hrhohpqcmhgvejykbpgj (us-west-2)
--  PG Engine     : 17
--
--  INSTRUCCIONES:
--    Ejecutar este script completo en el SQL Editor de Supabase
--    para revertir la BD al estado en que fue capturado.
--    El script es IDEMPOTENTE: usa CREATE OR REPLACE y
--    DROP IF EXISTS / ON CONFLICT DO NOTHING donde aplica.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. EXTENSIONES REQUERIDAS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ============================================================
-- 1. TIPOS ENUM
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.actividad_servicio AS ENUM ('remoto', 'oficina', 'domicilio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_servicio AS ENUM ('pendiente', 'en proceso', 'finalizado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prioridad_servicio AS ENUM ('urgente', 'alto', 'media', 'baja');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rol_usuario AS ENUM ('administrador', 'limitado', 'minimo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_nota AS ENUM ('traspaso', 'apoyo', 'observacion', 'cierre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.queue_estado AS ENUM ('pendiente', 'procesando', 'completado', 'fallido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.queue_operacion AS ENUM ('insert', 'update', 'correccion', 'delete', 'aprobar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.queue_tabla AS ENUM (
    'orden_servicio', 'perfil_info', 'contacto', 'cierre_orden',
    'clientes', 'empresa', 'orden_apoyo', 'orden_nota'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABLAS (en orden de dependencia)
-- ============================================================

-- 2.1 perfil_info
CREATE TABLE IF NOT EXISTS public.perfil_info (
    id_perfil_info   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_usuario     uuid,
    usuario          text        NOT NULL,
    nombres          text        NOT NULL,
    apellido_paterno text        NOT NULL,
    apellido_materno text,
    rol              public.rol_usuario DEFAULT 'minimo',
    created          timestamptz DEFAULT timezone('utc', now()),
    last_update      timestamptz DEFAULT timezone('utc', now())
);
ALTER TABLE public.perfil_info ENABLE ROW LEVEL SECURITY;

-- 2.2 contacto
CREATE TABLE IF NOT EXISTS public.contacto (
    id_contacto     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_perfil_info  uuid        NOT NULL,
    lada            text,
    telefono        text,
    direccion       text,
    correo_personal text,
    created         timestamptz DEFAULT timezone('utc', now()),
    last_update     timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT contacto_id_perfil_info_fkey
        FOREIGN KEY (id_perfil_info) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.contacto ENABLE ROW LEVEL SECURITY;

-- 2.3 empresa  (versionada, auto-referencia)
CREATE TABLE IF NOT EXISTS public.empresa (
    id_empresa    uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre        text    NOT NULL,
    direccion     text,
    correo        text,
    lada          text,
    telefono      text,
    id_raiz       uuid,
    version       integer DEFAULT 1,
    es_actual     boolean DEFAULT true,
    es_correccion boolean DEFAULT false,
    motivo_cambio text,
    editado_por   uuid,
    created       timestamptz DEFAULT timezone('utc', now()),
    last_update   timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT empresa_id_raiz_fkey
        FOREIGN KEY (id_raiz) REFERENCES public.empresa (id_empresa),
    CONSTRAINT empresa_editado_por_fkey
        FOREIGN KEY (editado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;

-- 2.4 clientes (versionada)
CREATE TABLE IF NOT EXISTS public.clientes (
    id_cliente    uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_empresa    uuid,
    nombre        text,
    direccion     text,
    correo        text,
    lada          text,
    telefono      text,
    id_raiz       uuid,
    version       integer DEFAULT 1,
    es_actual     boolean DEFAULT true,
    es_correccion boolean DEFAULT false,
    motivo_cambio text,
    editado_por   uuid,
    created       timestamptz DEFAULT timezone('utc', now()),
    last_update   timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT clientes_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES public.empresa (id_empresa),
    CONSTRAINT clientes_id_raiz_fkey
        FOREIGN KEY (id_raiz) REFERENCES public.clientes (id_cliente),
    CONSTRAINT clientes_editado_por_fkey
        FOREIGN KEY (editado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- 2.5 orden_servicio
CREATE TABLE IF NOT EXISTS public.orden_servicio (
    id_orden_servicio uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_orden      integer NOT NULL,
    prioridad         public.prioridad_servicio DEFAULT 'baja',
    actividad         public.actividad_servicio DEFAULT 'oficina',
    problema          text,
    equipo            text,
    responsable       uuid,
    observaciones     text,
    estado            public.estado_servicio DEFAULT 'pendiente',
    id_clientes       uuid,
    realizado_por     uuid,
    search_vector     tsvector,
    finalized_at      timestamptz,
    created           timestamptz DEFAULT timezone('utc', now()),
    last_update       timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT orden_servicio_responsable_fkey
        FOREIGN KEY (responsable) REFERENCES public.perfil_info (id_perfil_info),
    CONSTRAINT orden_servicio_id_clientes_fkey
        FOREIGN KEY (id_clientes) REFERENCES public.clientes (id_cliente),
    CONSTRAINT orden_servicio_created_by_fkey
        FOREIGN KEY (realizado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.orden_servicio ENABLE ROW LEVEL SECURITY;

-- 2.6 cierre_orden
CREATE TABLE IF NOT EXISTS public.cierre_orden (
    id_cierre             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_orden_servicio     uuid        NOT NULL,
    cerrado_por           uuid,
    finalized_at          timestamptz NOT NULL DEFAULT timezone('utc', now()),
    observaciones_finales text,
    CONSTRAINT cierre_orden_id_orden_fkey
        FOREIGN KEY (id_orden_servicio) REFERENCES public.orden_servicio (id_orden_servicio),
    CONSTRAINT cierre_orden_cerrado_por_fkey
        FOREIGN KEY (cerrado_por) REFERENCES public.perfil_info (id_perfil_info),
    UNIQUE (id_orden_servicio)
);
ALTER TABLE public.cierre_orden ENABLE ROW LEVEL SECURITY;

-- 2.7 orden_apoyo
CREATE TABLE IF NOT EXISTS public.orden_apoyo (
    id_apoyo          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_orden_servicio uuid NOT NULL,
    id_tecnico        uuid NOT NULL,
    notas             text,
    realizado_por     uuid,
    created           timestamptz DEFAULT timezone('utc', now()),
    last_update       timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT orden_apoyo_id_orden_fkey
        FOREIGN KEY (id_orden_servicio) REFERENCES public.orden_servicio (id_orden_servicio),
    CONSTRAINT orden_apoyo_id_tecnico_fkey
        FOREIGN KEY (id_tecnico) REFERENCES public.perfil_info (id_perfil_info),
    CONSTRAINT orden_apoyo_realizado_por_fkey
        FOREIGN KEY (realizado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.orden_apoyo ENABLE ROW LEVEL SECURITY;

-- 2.8 orden_nota
CREATE TABLE IF NOT EXISTS public.orden_nota (
    id_nota              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_orden_servicio    uuid NOT NULL,
    tipo                 public.tipo_nota NOT NULL,
    nota                 text NOT NULL,
    responsable_antes    uuid,
    responsable_despues  uuid,
    realizado_por        uuid,
    created              timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT orden_nota_id_orden_servicio_fkey
        FOREIGN KEY (id_orden_servicio) REFERENCES public.orden_servicio (id_orden_servicio),
    CONSTRAINT orden_nota_responsable_antes_fkey
        FOREIGN KEY (responsable_antes) REFERENCES public.perfil_info (id_perfil_info),
    CONSTRAINT orden_nota_responsable_despues_fkey
        FOREIGN KEY (responsable_despues) REFERENCES public.perfil_info (id_perfil_info),
    CONSTRAINT orden_nota_realizado_por_fkey
        FOREIGN KEY (realizado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.orden_nota ENABLE ROW LEVEL SECURITY;

-- 2.9 auditoria_log
CREATE TABLE IF NOT EXISTS public.auditoria_log (
    id_log          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tabla           text NOT NULL,
    operacion       text NOT NULL,
    id_registro     uuid,
    datos_antes     jsonb,
    datos_despues   jsonb,
    campos_cambios  text[],
    realizado_por   uuid,
    created         timestamptz DEFAULT now(),
    CONSTRAINT auditoria_log_realizado_por_fkey
        FOREIGN KEY (realizado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.auditoria_log ENABLE ROW LEVEL SECURITY;

-- 2.10 notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones (
    id_notificacion   uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_usuario        uuid    NOT NULL,
    titulo            text    NOT NULL,
    descripcion       text    NOT NULL DEFAULT '',
    tipo              text    NOT NULL DEFAULT 'info',
    prioridad         public.prioridad_servicio,
    tabla_referencia  text,
    id_referencia     uuid,
    is_read           boolean NOT NULL DEFAULT false,
    is_completed      boolean NOT NULL DEFAULT false,
    is_deleted        boolean NOT NULL DEFAULT false,
    created           timestamptz DEFAULT timezone('utc', now()),
    last_update       timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT notificaciones_id_usuario_fkey
        FOREIGN KEY (id_usuario) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- 2.11 peticion_queue
CREATE TABLE IF NOT EXISTS public.peticion_queue (
    id_peticion    uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    operacion      public.queue_operacion NOT NULL,
    tabla_destino  public.queue_tabla     NOT NULL,
    id_registro    uuid,
    payload        jsonb NOT NULL,
    es_correccion  boolean DEFAULT false,
    motivo_cambio  text,
    estado         public.queue_estado DEFAULT 'pendiente',
    error_detalle  text,
    intentos       integer DEFAULT 0,
    max_intentos   integer DEFAULT 3,
    realizado_por  uuid,
    created        timestamptz DEFAULT timezone('utc', now()),
    last_update    timestamptz DEFAULT timezone('utc', now()),
    procesado_at   timestamptz,
    CONSTRAINT peticion_queue_realizado_por_fkey
        FOREIGN KEY (realizado_por) REFERENCES public.perfil_info (id_perfil_info)
);
ALTER TABLE public.peticion_queue ENABLE ROW LEVEL SECURITY;

-- 2.12 login_intentos
CREATE TABLE IF NOT EXISTS public.login_intentos (
    id       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email    text        NOT NULL,
    ip       text        NOT NULL,
    exitoso  boolean     NOT NULL,
    created  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.login_intentos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. VISTA
-- ============================================================

CREATE OR REPLACE VIEW public.v_stats_por_cliente AS
SELECT
    c.id_cliente,
    e.nombre AS empresa,
    COUNT(os.id_orden_servicio)::integer AS total_ordenes,
    ROUND(
        AVG(EXTRACT(EPOCH FROM (os.finalized_at - os.created)) / 3600.0)
        FILTER (WHERE os.estado = 'finalizado' AND os.finalized_at IS NOT NULL)
    , 1) AS tiempo_prom_resolucion_hs
FROM public.clientes c
LEFT JOIN public.empresa e ON e.id_empresa = c.id_empresa AND e.es_actual = true
LEFT JOIN public.orden_servicio os ON os.id_clientes = c.id_cliente
WHERE c.es_actual = true
GROUP BY c.id_cliente, e.nombre;

-- ============================================================
-- 4. FUNCIONES
-- ============================================================

-- 4.1 Helpers de sesión
CREATE OR REPLACE FUNCTION public.fn_perfil_actual()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id_perfil_info
    FROM public.perfil_info
   WHERE auth_usuario = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_rol_actual()
RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rol
    FROM public.perfil_info
   WHERE auth_usuario = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_es_responsable_de_orden(p_id_orden_servicio uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orden_servicio os
    WHERE os.id_orden_servicio = p_id_orden_servicio
      AND os.responsable = fn_perfil_actual()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_es_apoyo_de_orden(p_id_orden_servicio uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orden_apoyo oa
    WHERE oa.id_orden_servicio = p_id_orden_servicio
      AND oa.id_tecnico = fn_perfil_actual()
  );
$$;

-- 4.2 Utilidades de triggers
CREATE OR REPLACE FUNCTION public.fn_update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_update = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_responsable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  col          text := TG_ARGV[0];
  v_id_perfil  uuid;
  v_actual     uuid;
BEGIN
  v_actual := (to_jsonb(NEW) ->> col)::uuid;
  IF v_actual IS NULL THEN
    SELECT id_perfil_info INTO v_id_perfil
    FROM public.perfil_info
    WHERE auth_usuario = auth.uid()
    LIMIT 1;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(col, v_id_perfil));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_id_raiz()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pk_column text := TG_ARGV[0];
BEGIN
  IF NEW.id_raiz IS NULL AND NEW.es_correccion = false THEN
    NEW.id_raiz := (to_jsonb(NEW) ->> pk_column)::uuid;
  END IF;
  RETURN NEW;
END;
$$;

-- 4.3 Auditoría
CREATE OR REPLACE FUNCTION public.fn_trigger_auditoria()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_datos_antes    jsonb;
    v_datos_despues  jsonb;
    v_campos_cambios text[];
    v_realizado_por  uuid;
    v_pk_column      text;
BEGIN
    IF TG_TABLE_NAME = 'peticion_queue' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_pk_column := COALESCE(TG_ARGV[0], 'id_' || TG_TABLE_NAME);

    IF TG_OP = 'DELETE' THEN
        v_datos_antes   := to_jsonb(OLD);
        v_datos_despues := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_datos_antes   := NULL;
        v_datos_despues := to_jsonb(NEW);
    ELSE
        v_datos_antes   := to_jsonb(OLD);
        v_datos_despues := to_jsonb(NEW);
        SELECT array_agg(key) INTO v_campos_cambios
        FROM jsonb_each(v_datos_antes) old_row
        WHERE old_row.value IS DISTINCT FROM (v_datos_despues -> old_row.key);
    END IF;

    v_realizado_por := COALESCE(
        (v_datos_despues->>'realizado_por')::uuid,
        (v_datos_despues->>'editado_por')::uuid,
        (v_datos_despues->>'created_by')::uuid,
        (v_datos_antes->>'realizado_por')::uuid,
        (v_datos_antes->>'editado_por')::uuid,
        (v_datos_antes->>'created_by')::uuid
    );

    IF v_realizado_por IS NULL THEN
        SELECT id_perfil_info INTO v_realizado_por
        FROM public.perfil_info
        WHERE auth_usuario = auth.uid()
        LIMIT 1;
    END IF;

    INSERT INTO public.auditoria_log (
        tabla, operacion, id_registro,
        datos_antes, datos_despues, campos_cambios, realizado_por
    ) VALUES (
        TG_TABLE_NAME, TG_OP,
        COALESCE(
            (v_datos_despues->>v_pk_column)::uuid,
            (v_datos_antes ->>v_pk_column)::uuid
        ),
        v_datos_antes, v_datos_despues, v_campos_cambios, v_realizado_por
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4.4 Notificaciones in-app
CREATE OR REPLACE FUNCTION public.fn_crear_notificacion(
    p_id_usuario        uuid,
    p_titulo            text,
    p_descripcion       text,
    p_tipo              text    DEFAULT 'info',
    p_prioridad         text    DEFAULT NULL,
    p_tabla_referencia  text    DEFAULT NULL,
    p_id_referencia     uuid    DEFAULT NULL,
    p_evitar_actor      boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_actor text;
BEGIN
    IF p_id_usuario IS NULL THEN RETURN; END IF;

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

CREATE OR REPLACE FUNCTION public.fn_notificar_cierre_orden()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.fn_notificar_contacto()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.fn_notificar_correo_cliente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_url      text;
    v_secret   text;
    v_tipo     text;
    v_id_orden uuid;
    v_obs      text;
BEGIN
    IF TG_TABLE_NAME = 'orden_servicio' THEN
        IF TG_OP = 'INSERT' THEN
            v_tipo     := 'levantada';
            v_id_orden := NEW.id_orden_servicio;
        ELSIF TG_OP = 'UPDATE'
              AND NEW.estado::text = 'en proceso'
              AND OLD.estado::text IS DISTINCT FROM NEW.estado::text THEN
            v_tipo     := 'en_proceso';
            v_id_orden := NEW.id_orden_servicio;
        ELSE
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'cierre_orden' THEN
        v_tipo     := 'cerrada';
        v_id_orden := NEW.id_orden_servicio;
        v_obs      := NEW.observaciones_finales;
    ELSE
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'edge_function_secret';

    IF v_url IS NULL OR v_secret IS NULL THEN
        RAISE WARNING 'fn_notificar_correo_cliente: faltan secretos en Vault para orden %', v_id_orden;
        RETURN COALESCE(NEW, OLD);
    END IF;

    PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', v_secret
        ),
        body := jsonb_build_object(
            'tipo', v_tipo,
            'id_orden_servicio', v_id_orden,
            'observaciones_finales', v_obs
        )
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_notificar_orden_apoyo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.fn_notificar_orden_nota()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.fn_notificar_orden_servicio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_titulo      text;
    v_desc        text;
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
                NEW.prioridad::text, 'orden_servicio', NEW.id_orden_servicio
            );
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Cambio de responsable
        IF NEW.responsable IS DISTINCT FROM OLD.responsable THEN
            IF NEW.responsable IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    NEW.responsable, 'Se te asignó una orden',
                    format('Ahora eres responsable de la orden #%s.', NEW.numero_orden),
                    CASE WHEN NEW.prioridad::text = 'urgente' THEN 'alert' ELSE 'info' END,
                    NEW.prioridad::text, 'orden_servicio', NEW.id_orden_servicio
                );
            END IF;
            IF OLD.responsable IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    OLD.responsable, 'Ya no eres responsable de una orden',
                    format('Se te removió como responsable de la orden #%s.', NEW.numero_orden),
                    'info', NULL, 'orden_servicio', NEW.id_orden_servicio
                );
            END IF;
        END IF;

        -- Prioridad urgente
        IF NEW.prioridad IS DISTINCT FROM OLD.prioridad
           AND NEW.prioridad::text = 'urgente'
           AND NEW.responsable IS NOT NULL THEN
            PERFORM public.fn_crear_notificacion(
                NEW.responsable, '¡Orden marcada como urgente!',
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
            v_desc        := format('La orden #%s cambió a estado "%s".', NEW.numero_orden, NEW.estado::text);
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

        -- Edición general
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
                NEW.responsable, 'Orden actualizada',
                format('Se modificaron datos de la orden #%s.', NEW.numero_orden),
                'warning', NEW.prioridad::text, 'orden_servicio', NEW.id_orden_servicio
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_notificar_perfil_info()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

-- 4.5 Cola de peticiones
CREATE OR REPLACE FUNCTION public.fn_auto_procesar_cola()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.peticion_queue
    SET estado = 'procesando'
    WHERE id_peticion = NEW.id_peticion;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_procesar_peticion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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

            -- INSERT
            IF NEW.operacion::text = 'insert' THEN
                FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(NEW.payload) LOOP
                    CONTINUE WHEN v_val IS NULL;
                    CONTINUE WHEN v_val = 'null';
                    CONTINUE WHEN v_key = 'estado';
                    CONTINUE WHEN v_key = 'search_vector';
                    CONTINUE WHEN v_key = 'numero_orden';
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

            -- UPDATE / CORRECCIÓN
            ELSIF NEW.operacion::text IN ('update', 'correccion') THEN
                IF NEW.id_registro IS NULL THEN
                    RAISE EXCEPTION 'La operación % requiere un id_registro', NEW.operacion;
                END IF;

                IF NEW.tabla_destino::text = 'orden_nota' THEN
                    RAISE EXCEPTION 'Las notas de orden son inmutables y no pueden modificarse';
                END IF;

                -- Versionado clientes
                IF NEW.tabla_destino::text = 'clientes' THEN
                    v_es_correccion := COALESCE(
                        (NEW.payload->>'es_correccion')::boolean,
                        NEW.operacion::text = 'correccion'
                    );
                    SELECT * INTO v_datos_actuales_cli
                    FROM public.clientes WHERE id_cliente = NEW.id_registro;
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
                        UPDATE public.clientes SET es_actual = false WHERE id_cliente = NEW.id_registro;
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

                -- Versionado empresa
                ELSIF NEW.tabla_destino::text = 'empresa' THEN
                    v_es_correccion := COALESCE(
                        (NEW.payload->>'es_correccion')::boolean,
                        NEW.operacion::text = 'correccion'
                    );
                    SELECT * INTO v_datos_actuales_emp
                    FROM public.empresa WHERE id_empresa = NEW.id_registro;
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
                        UPDATE public.empresa SET es_actual = false WHERE id_empresa = NEW.id_registro;
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

                -- UPDATE genérico
                ELSE
                    FOR v_key IN SELECT key FROM jsonb_each(NEW.payload) LOOP
                        v_jval := NEW.payload -> v_key;
                        CONTINUE WHEN v_key = 'observaciones_finales';
                        CONTINUE WHEN v_key = 'search_vector';
                        CONTINUE WHEN v_key = 'numero_orden';

                        IF v_key = 'estado' AND NOT (
                            NEW.tabla_destino::text = 'orden_servicio'
                            AND (v_jval #>> '{}') IN ('finalizado', 'en proceso', 'pendiente')
                        ) THEN CONTINUE; END IF;

                        IF v_jval IS NULL OR v_jval = 'null'::jsonb THEN
                            IF v_key IN ('id_cliente', 'id_empresa', 'responsable', 'id_apoyo') THEN
                                v_set_parts := array_append(v_set_parts, format('%I = NULL', v_key));
                            END IF;
                            CONTINUE;
                        END IF;

                        IF v_key = 'finalized_at' THEN
                            v_set_parts := array_append(v_set_parts,
                                format('%I = %L::timestamptz', v_key, v_jval #>> '{}'));
                        ELSIF v_key IN (
                            'responsable','id_cliente','id_empresa','realizado_por',
                            'id_orden_servicio','id_tecnico','asignado_por','creado_por',
                            'responsable_antes','responsable_despues','id_apoyo',
                            'cerrado_por','editado_por'
                        ) THEN
                            v_set_parts := array_append(v_set_parts,
                                format('%I = %L::uuid', v_key, v_jval #>> '{}'));
                        ELSIF v_key IN ('activo','es_actual','es_correccion') THEN
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

                    IF NEW.tabla_destino::text = 'orden_servicio'
                       AND (NEW.payload->>'estado') = 'finalizado' THEN
                        INSERT INTO public.cierre_orden (
                            id_orden_servicio, cerrado_por, finalized_at, observaciones_finales
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

            -- DELETE
            ELSIF NEW.operacion::text = 'delete' THEN
                IF NEW.id_registro IS NULL THEN
                    RAISE EXCEPTION 'La operación DELETE requiere un id_registro';
                END IF;
                IF NEW.tabla_destino::text = 'orden_nota' THEN
                    RAISE EXCEPTION 'Las notas de orden son inmutables y no pueden eliminarse';
                END IF;
                v_query := format(
                    'DELETE FROM public.%I WHERE %I = %L::uuid',
                    NEW.tabla_destino::text, v_pk_col, NEW.id_registro::text
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

            IF NEW.realizado_por IS NOT NULL THEN
                PERFORM public.fn_crear_notificacion(
                    NEW.realizado_por,
                    'No se pudo completar tu solicitud',
                    format('Falló "%s" sobre "%s": %s',
                        NEW.operacion::text, NEW.tabla_destino::text, left(SQLERRM, 180)),
                    'alert', 'urgente', 'peticion_queue', NEW.id_peticion,
                    false
                );
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$$;

-- 4.6 Función de estadísticas
CREATE OR REPLACE FUNCTION public.get_stats_por_cliente()
RETURNS SETOF public.v_stats_por_cliente
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.perfil_info
    WHERE auth_usuario = auth.uid() AND rol = 'administrador'
  ) THEN
    RAISE EXCEPTION 'Permisos insuficientes.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.v_stats_por_cliente;
END;
$$;

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Helpers para recrear triggers de forma idempotente
-- (DROP IF EXISTS + CREATE)

-- ── cierre_orden ────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auditoria_cierre_orden    ON public.cierre_orden;
DROP TRIGGER IF EXISTS trg_correo_cierre_orden      ON public.cierre_orden;
DROP TRIGGER IF EXISTS trg_notificar_cierre_orden   ON public.cierre_orden;

CREATE TRIGGER tr_auditoria_cierre_orden
    AFTER INSERT OR UPDATE OR DELETE ON public.cierre_orden
    FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_auditoria('id_cierre');

CREATE TRIGGER trg_correo_cierre_orden
    AFTER INSERT ON public.cierre_orden
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_correo_cliente();

CREATE TRIGGER trg_notificar_cierre_orden
    AFTER INSERT ON public.cierre_orden
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_cierre_orden();

-- ── clientes ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auditoria_clientes         ON public.clientes;
DROP TRIGGER IF EXISTS tr_set_editado_por_cliente    ON public.clientes;
DROP TRIGGER IF EXISTS tr_set_id_raiz_cliente        ON public.clientes;
DROP TRIGGER IF EXISTS tr_update_clientes            ON public.clientes;

CREATE TRIGGER tr_auditoria_clientes
    AFTER INSERT OR UPDATE OR DELETE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_auditoria('id_cliente');

CREATE TRIGGER tr_set_editado_por_cliente
    BEFORE UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsable('editado_por');

CREATE TRIGGER tr_set_id_raiz_cliente
    BEFORE INSERT ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_id_raiz('id_cliente');

CREATE TRIGGER tr_update_clientes
    BEFORE UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at_column();

-- ── contacto ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auditoria_contacto    ON public.contacto;
DROP TRIGGER IF EXISTS tr_update_contacto       ON public.contacto;
DROP TRIGGER IF EXISTS trg_notificar_contacto   ON public.contacto;

CREATE TRIGGER tr_auditoria_contacto
    AFTER INSERT OR UPDATE OR DELETE ON public.contacto
    FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_auditoria('id_contacto');

CREATE TRIGGER tr_update_contacto
    BEFORE UPDATE ON public.contacto
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at_column();

CREATE TRIGGER trg_notificar_contacto
    AFTER UPDATE ON public.contacto
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_contacto();

-- ── empresa ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auditoria_empresa       ON public.empresa;
DROP TRIGGER IF EXISTS tr_set_editado_por_empresa ON public.empresa;
DROP TRIGGER IF EXISTS tr_set_id_raiz_empresa     ON public.empresa;
DROP TRIGGER IF EXISTS tr_update_empresa          ON public.empresa;

CREATE TRIGGER tr_auditoria_empresa
    AFTER INSERT OR UPDATE OR DELETE ON public.empresa
    FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_auditoria('id_empresa');

CREATE TRIGGER tr_set_editado_por_empresa
    BEFORE UPDATE ON public.empresa
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsable('editado_por');

CREATE TRIGGER tr_set_id_raiz_empresa
    BEFORE INSERT ON public.empresa
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_id_raiz('id_empresa');

CREATE TRIGGER tr_update_empresa
    BEFORE UPDATE ON public.empresa
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at_column();

-- ── orden_apoyo ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notificar_orden_apoyo ON public.orden_apoyo;

CREATE TRIGGER trg_notificar_orden_apoyo
    AFTER INSERT OR DELETE ON public.orden_apoyo
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_orden_apoyo();

-- ── orden_nota ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notificar_orden_nota ON public.orden_nota;

CREATE TRIGGER trg_notificar_orden_nota
    AFTER INSERT ON public.orden_nota
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_orden_nota();

-- ── orden_servicio ──────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auditoria_orden_servicio    ON public.orden_servicio;
DROP TRIGGER IF EXISTS tr_set_realizado_por_orden     ON public.orden_servicio;
DROP TRIGGER IF EXISTS tr_update_orden_servicio       ON public.orden_servicio;
DROP TRIGGER IF EXISTS trg_correo_orden_servicio      ON public.orden_servicio;
DROP TRIGGER IF EXISTS trg_notificar_orden_servicio   ON public.orden_servicio;

CREATE TRIGGER tr_auditoria_orden_servicio
    AFTER INSERT OR UPDATE OR DELETE ON public.orden_servicio
    FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_auditoria('id_orden_servicio');

CREATE TRIGGER tr_set_realizado_por_orden
    BEFORE INSERT ON public.orden_servicio
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsable('realizado_por');

CREATE TRIGGER tr_update_orden_servicio
    BEFORE UPDATE ON public.orden_servicio
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at_column();

CREATE TRIGGER trg_correo_orden_servicio
    AFTER INSERT OR UPDATE ON public.orden_servicio
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_correo_cliente();

CREATE TRIGGER trg_notificar_orden_servicio
    AFTER INSERT OR UPDATE ON public.orden_servicio
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_orden_servicio();

-- ── perfil_info ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auditoria_perfil_info    ON public.perfil_info;
DROP TRIGGER IF EXISTS tr_update_perfil_info       ON public.perfil_info;
DROP TRIGGER IF EXISTS trg_notificar_perfil_info   ON public.perfil_info;

CREATE TRIGGER tr_auditoria_perfil_info
    AFTER INSERT OR UPDATE OR DELETE ON public.perfil_info
    FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_auditoria('id_perfil_info');

CREATE TRIGGER tr_update_perfil_info
    BEFORE UPDATE ON public.perfil_info
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at_column();

CREATE TRIGGER trg_notificar_perfil_info
    AFTER UPDATE ON public.perfil_info
    FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_perfil_info();

-- ── peticion_queue ──────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_auto_procesar_cola        ON public.peticion_queue;
DROP TRIGGER IF EXISTS tr_procesar_peticion         ON public.peticion_queue;
DROP TRIGGER IF EXISTS tr_set_realizado_por_peticion ON public.peticion_queue;
DROP TRIGGER IF EXISTS tr_update_peticion_queue     ON public.peticion_queue;

CREATE TRIGGER tr_auto_procesar_cola
    AFTER INSERT ON public.peticion_queue
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_procesar_cola();

CREATE TRIGGER tr_procesar_peticion
    BEFORE UPDATE ON public.peticion_queue
    FOR EACH ROW EXECUTE FUNCTION public.fn_procesar_peticion();

CREATE TRIGGER tr_set_realizado_por_peticion
    BEFORE INSERT ON public.peticion_queue
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_responsable('realizado_por');

CREATE TRIGGER tr_update_peticion_queue
    BEFORE UPDATE ON public.peticion_queue
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at_column();

-- ============================================================
-- 6. REPLICA IDENTITY (para Realtime)
-- ============================================================
ALTER TABLE public.perfil_info      REPLICA IDENTITY FULL;
ALTER TABLE public.contacto         REPLICA IDENTITY FULL;
ALTER TABLE public.empresa          REPLICA IDENTITY FULL;
ALTER TABLE public.clientes         REPLICA IDENTITY FULL;
ALTER TABLE public.orden_servicio   REPLICA IDENTITY FULL;
ALTER TABLE public.cierre_orden     REPLICA IDENTITY FULL;
ALTER TABLE public.orden_apoyo      REPLICA IDENTITY FULL;
ALTER TABLE public.orden_nota       REPLICA IDENTITY FULL;
ALTER TABLE public.auditoria_log    REPLICA IDENTITY FULL;
ALTER TABLE public.notificaciones   REPLICA IDENTITY FULL;
ALTER TABLE public.peticion_queue   REPLICA IDENTITY FULL;
ALTER TABLE public.login_intentos   REPLICA IDENTITY FULL;

COMMIT;

-- FIN DEL ROLLBACK SNAPSHOT
