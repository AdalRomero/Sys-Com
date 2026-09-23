-- =====================================================================
-- Migración: Registro de intentos de login (anti fuerza bruta)
-- =====================================================================
-- Objetivo: permitir que la Edge Function `login` bloquee temporalmente
-- una cuenta (por correo) o una IP después de varios intentos fallidos
-- recientes, sin depender únicamente del rate-limit genérico de Supabase
-- Auth (que es solo por IP y no distingue cuentas).
--
-- Esta tabla NO tiene policies de SELECT/INSERT/UPDATE/DELETE para
-- 'anon' ni 'authenticated' -- con RLS activado y sin policies, el
-- acceso queda denegado por defecto para esos roles. Solo la Edge
-- Function puede leer/escribir aquí, porque usa la service role key,
-- que siempre bypassa RLS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.login_intentos (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email     text NOT NULL,
    ip        text NOT NULL,
    exitoso   boolean NOT NULL,
    created   timestamptz NOT NULL DEFAULT now()
);

-- Los conteos de bloqueo siempre filtran por email/ip + ventana de tiempo
-- reciente, así que estos son los dos accesos que importa que sean rápidos.
CREATE INDEX IF NOT EXISTS idx_login_intentos_email_created
    ON public.login_intentos (email, created DESC);

CREATE INDEX IF NOT EXISTS idx_login_intentos_ip_created
    ON public.login_intentos (ip, created DESC);

-- Para poder purgar filas viejas de forma barata (ver limpieza oportunista
-- en la Edge Function).
CREATE INDEX IF NOT EXISTS idx_login_intentos_created
    ON public.login_intentos (created);

ALTER TABLE public.login_intentos ENABLE ROW LEVEL SECURITY;
-- Intencionalmente sin policies: nadie con anon/authenticated key puede
-- leer ni escribir esta tabla directo desde el cliente.
