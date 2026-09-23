-- ============================================================
-- SCRIPT DE ACTUALIZACIÓN: RESOLUCIÓN DE CONFLICTOS
-- ============================================================

-- 1. Añadir el estado 'conflicto' al enum (esto no puede correr dentro de un bloque de transacción si ya existe,
-- pero Postgres > 12 soporta ADD VALUE IF NOT EXISTS)
COMMIT;
ALTER TYPE public.queue_estado ADD VALUE IF NOT EXISTS 'conflicto';

BEGIN;

-- 2. Añadir nuevas columnas a peticion_queue
ALTER TABLE public.peticion_queue 
ADD COLUMN IF NOT EXISTS last_update_conocido timestamptz,
ADD COLUMN IF NOT EXISTS datos_conflicto jsonb;

-- 3. Actualizar la función procesadora para inyectar la lógica de conflictos
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
    
    -- Variables para conflictos
    v_db_changed_cols         text[];
    v_payload_cols            text[];
    v_chocan                  text[];
    v_actual_last_update      timestamptz;
    v_datos_actuales_json     jsonb;
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
                
                -- OBTENER REGISTRO ACTUAL Y CHECK DE CONFLICTO
                v_query := format('SELECT last_update, to_jsonb(t) FROM public.%I t WHERE %I = %L::uuid', 
                                  NEW.tabla_destino::text, v_pk_col, NEW.id_registro::text);
                EXECUTE v_query INTO v_actual_last_update, v_datos_actuales_json;
                
                IF v_actual_last_update IS NULL THEN
                     RAISE EXCEPTION 'No se encontró registro con id %', NEW.id_registro;
                END IF;

                -- LOGICA DE CONFLICTOS
                IF NEW.last_update_conocido IS NOT NULL AND v_actual_last_update > NEW.last_update_conocido THEN
                    -- El registro cambió desde que se descargó offline
                    SELECT array_agg(DISTINCT c) INTO v_db_changed_cols
                    FROM public.auditoria_log l, unnest(l.campos_cambios) c
                    WHERE l.id_registro = NEW.id_registro
                      AND l.tabla = NEW.tabla_destino::text
                      AND l.created > NEW.last_update_conocido;
                      
                    SELECT array_agg(key) INTO v_payload_cols FROM jsonb_each(NEW.payload);
                    
                    SELECT array_agg(c) INTO v_chocan 
                    FROM (SELECT unnest(v_db_changed_cols) INTERSECT SELECT unnest(v_payload_cols)) as t(c);
                    
                    IF array_length(v_chocan, 1) > 0 THEN
                        -- CHOQUE DURO
                        NEW.estado := 'conflicto';
                        NEW.datos_conflicto := jsonb_build_object(
                            'db_actual', v_datos_actuales_json,
                            'tu_payload', NEW.payload,
                            'columnas_chocan', v_chocan
                        );
                        
                        IF NEW.realizado_por IS NOT NULL THEN
                            PERFORM public.fn_crear_notificacion(
                                NEW.realizado_por, 'Conflicto de sincronización',
                                format('Tus cambios en %s chocan con otras ediciones. Revisa el Centro de Resoluciones.', NEW.tabla_destino::text),
                                'warning', 'alto', 'peticion_queue', NEW.id_peticion, false
                            );
                        END IF;
                        
                        RETURN NEW; -- Detener procesamiento, la petición queda en conflicto
                    ELSE
                        -- CHOQUE BLANDO (Diferentes columnas)
                        IF NEW.realizado_por IS NOT NULL THEN
                            PERFORM public.fn_crear_notificacion(
                                NEW.realizado_por, 'Cambios fusionados',
                                format('Tus ediciones offline en %s se fusionaron exitosamente con otras modificaciones recientes.', NEW.tabla_destino::text),
                                'info', NULL, NEW.tabla_destino::text, NEW.id_registro, false
                            );
                        END IF;
                    END IF;
                END IF;

                -- Continúa la actualización normal...

                -- Versionado clientes
                IF NEW.tabla_destino::text = 'clientes' THEN
                    v_es_correccion := COALESCE(
                        (NEW.payload->>'es_correccion')::boolean,
                        NEW.operacion::text = 'correccion'
                    );
                    
                    -- Llenar ROWTYPE a partir del JSON que ya obtuvimos
                    SELECT * INTO v_datos_actuales_cli FROM jsonb_populate_record(null::public.clientes, v_datos_actuales_json);
                    
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
                    SELECT * INTO v_datos_actuales_emp FROM jsonb_populate_record(null::public.empresa, v_datos_actuales_json);

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

COMMIT;
