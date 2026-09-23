-- Migración: Habilitar REPLICA IDENTITY FULL en tablas clave
-- Necesario para que Supabase Realtime envíe el payload completo
-- en eventos UPDATE y DELETE (no solo la PRIMARY KEY).
-- Sin esto, los hooks de realtime no reciben los datos correctamente.

ALTER TABLE orden_servicio REPLICA IDENTITY FULL;
ALTER TABLE clientes       REPLICA IDENTITY FULL;
ALTER TABLE empresa        REPLICA IDENTITY FULL;
ALTER TABLE perfil_info    REPLICA IDENTITY FULL;
ALTER TABLE contacto       REPLICA IDENTITY FULL;
ALTER TABLE peticion_queue REPLICA IDENTITY FULL;
