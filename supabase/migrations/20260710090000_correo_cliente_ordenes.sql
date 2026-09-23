-- =====================================================================
-- Migración: Correo al cliente disparado desde la base de datos
-- =====================================================================
-- Objetivo: eliminar el problema original (el frontend disparaba el
-- correo justo después de encolar en `peticion_queue`, antes de que la
-- fila existiera de verdad, y a veces con datos incompletos o con la
-- app ya cerrada). Se replica el mismo patrón que ya usa
-- `20260709120000_sistema_notificaciones.sql` para las notificaciones
-- internas: un trigger AFTER en la tabla REAL, que se dispara solo
-- cuando `fn_procesar_peticion` ya hizo el INSERT/UPDATE de verdad.
--
-- Diferencia con las notificaciones internas: esto sí necesita salir
-- por red (llamar a una Edge Function que manda el correo), así que
-- usamos pg_net para la llamada HTTP asíncrona, y Supabase Vault para
-- no dejar la URL/secreto de la función en texto plano dentro del
-- código SQL versionado.
--
-- Eventos cubiertos (mismos 3 correos que ya existían en el frontend):
--   1. orden_servicio  INSERT                       -> "levantada"
--   2. orden_servicio  UPDATE estado -> 'en proceso' -> "en_proceso"
--   3. cierre_orden    INSERT                       -> "cerrada"
-- =====================================================================

-- ==========================================
-- 1. Extensión pg_net (llamadas HTTP async desde triggers)
-- ==========================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ==========================================
-- 2. Secretos en Vault: URL de la Edge Function + secreto compartido
-- ==========================================
-- IMPORTANTE: después de correr esta migración, reemplaza el valor del
-- secreto por uno propio (no dejes el generado en un log/CI):
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'edge_function_secret'),
--     '<un-secreto-largo-y-aleatorio>'
--   );
--
-- Y configura el MISMO valor como variable de entorno de la Edge
-- Function `notificar-cliente-orden`:
--
--   supabase secrets set WEBHOOK_SECRET=<el-mismo-secreto>
--
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_function_url') THEN
    PERFORM vault.create_secret(
      'https://<TU_PROJECT_REF>.supabase.co/functions/v1/notificar-cliente-orden',
      'edge_function_url'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_function_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'edge_function_secret'
    );
  END IF;
END $$;

-- ==========================================
-- 3. Función de trigger: arma el payload y llama a la Edge Function
-- ==========================================
-- Una sola función cubre las 3 tablas/eventos (a diferencia de
-- fn_notificar_orden_servicio / fn_notificar_cierre_orden, que están
-- separadas por tabla): aquí el cuerpo es casi idéntico en los tres
-- casos (armar payload + net.http_post), así que separarlo solo
-- duplicaría código. Si el día de mañana cada tipo de correo necesita
-- lógica muy distinta, sepáralas como se hizo con las notificaciones.
CREATE OR REPLACE FUNCTION public.fn_notificar_correo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_url      text;
    v_secret   text;
    v_tipo     text;
    v_id_orden uuid;
    v_obs      text;
BEGIN
    -- ── Decidir si este evento nos interesa y qué tipo de correo es ──
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
            RETURN NEW; -- cualquier otro cambio en orden_servicio no manda correo
        END IF;

    ELSIF TG_TABLE_NAME = 'cierre_orden' THEN
        v_tipo     := 'cerrada';
        v_id_orden := NEW.id_orden_servicio;
        v_obs      := NEW.observaciones_finales;

    ELSE
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- ── Leer URL y secreto desde Vault ──
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'edge_function_url';

    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'edge_function_secret';

    IF v_url IS NULL OR v_secret IS NULL THEN
        RAISE WARNING 'fn_notificar_correo_cliente: faltan secretos en Vault, no se envía correo para orden %', v_id_orden;
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- ── Disparo async: no bloquea el INSERT/UPDATE que lo originó ──
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

-- ==========================================
-- 4. Triggers sobre las tablas reales
-- ==========================================
DROP TRIGGER IF EXISTS trg_correo_orden_servicio ON public.orden_servicio;
CREATE TRIGGER trg_correo_orden_servicio
AFTER INSERT OR UPDATE OF estado ON public.orden_servicio
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_correo_cliente();

DROP TRIGGER IF EXISTS trg_correo_cierre_orden ON public.cierre_orden;
CREATE TRIGGER trg_correo_cierre_orden
AFTER INSERT ON public.cierre_orden
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_correo_cliente();
