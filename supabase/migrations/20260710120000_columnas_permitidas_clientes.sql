-- Update fn_columnas_permitidas to allow insert/update of clientes and empresa columns
DROP FUNCTION IF EXISTS public.fn_columnas_permitidas(text, text);

CREATE OR REPLACE FUNCTION public.fn_columnas_permitidas(p_tabla queue_tabla, p_operacion text)
 RETURNS text[]
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
    SELECT CASE p_tabla::text
        WHEN 'orden_servicio' THEN
            ARRAY['prioridad','actividad','problema','equipo','responsable',
                  'observaciones','estado','id_clientes','finalized_at']
        WHEN 'orden_apoyo' THEN
            CASE p_operacion
                WHEN 'insert' THEN ARRAY['id_orden_servicio','id_tecnico','notas']
                ELSE ARRAY['notas']
            END
        WHEN 'orden_nota' THEN
            ARRAY['id_orden_servicio','tipo','nota','responsable_antes','responsable_despues']
        WHEN 'cierre_orden' THEN
            ARRAY['observaciones_finales']
        WHEN 'perfil_info' THEN
            ARRAY['nombres','apellido_paterno','apellido_materno','usuario','rol']
        WHEN 'contacto' THEN
            ARRAY['correo_personal','lada','telefono','direccion']
        WHEN 'clientes' THEN
            ARRAY['id_empresa','nombre','direccion','correo','lada','telefono','es_correccion']
        WHEN 'empresa' THEN
            ARRAY['nombre','direccion','correo','lada','telefono','es_correccion']
        ELSE ARRAY[]::text[]
    END;
$function$;
