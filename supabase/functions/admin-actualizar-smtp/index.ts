// supabase/functions/admin-actualizar-smtp/index.ts
//
// Permite a un administrador cambiar el correo/contraseña SMTP que usa el
// sistema para notificar a los clientes, sin salir de la app.
//
// VERSIÓN VAULT — no requiere ningún Personal Access Token de tu cuenta.
// Las credenciales viven cifradas en Supabase Vault (dentro de tu propia
// base de datos), y se leen/escriben con la SUPABASE_SERVICE_ROLE_KEY que
// ya tienes por defecto en toda Edge Function.
//
// Requisito: haber corrido migracion_vault_smtp.sql antes de desplegar
// esto, para que existan fn_obtener_secreto_smtp / fn_actualizar_secreto_smtp.
//
// IMPORTANTE: la Edge Function que realmente ENVÍA los correos (ej.
// notificar-cliente-orden) también debe actualizarse para leer las
// credenciales llamando a fn_obtener_secreto_smtp('SMTP_USER') /
// fn_obtener_secreto_smtp('SMTP_PASS') en vez de Deno.env.get(...).
// Compárteme ese archivo si quieres que te lo ajuste.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405);
  }

  try {
    // --- 1. Validar sesión del usuario que llama ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No autenticado.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Sesión inválida o expirada.' }, 401);
    }

    // --- 2. Verificar rol de administrador ---
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfil_info')
      .select('id_perfil_info, rol, nombres, apellido_paterno, apellido_materno')
      .eq('auth_usuario', userData.user.id)
      .single();

    if (perfilError || !perfil) {
      return jsonResponse({ error: 'No se encontró el perfil del usuario.' }, 403);
    }

    if (perfil.rol !== 'administrador') {
      return jsonResponse({ error: 'No tienes permisos de administrador.' }, 403);
    }

    // --- 3. Validar el body ---
    const body = await req.json().catch(() => null);
    const correo = typeof body?.correo === 'string' ? body.correo.trim() : '';
    const contrasena = typeof body?.contrasena === 'string' ? body.contrasena : '';

    if (!correo || !contrasena) {
      return jsonResponse({ error: 'Correo y contraseña son obligatorios.' }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return jsonResponse({ error: 'El correo no tiene un formato válido.' }, 400);
    }

    // --- 4. Actualizar los secretos en Vault (vía RPC, sin Management API) ---
    const { error: errUser } = await supabaseAdmin.rpc('fn_actualizar_secreto_smtp', {
      p_nombre: 'SMTP_USER',
      p_valor: correo,
    });
    if (errUser) {
      console.error('Error actualizando SMTP_USER en Vault:', errUser);
      return jsonResponse({ error: 'No se pudo actualizar el correo.' }, 502);
    }

    const { error: errPass } = await supabaseAdmin.rpc('fn_actualizar_secreto_smtp', {
      p_nombre: 'SMTP_PASS',
      p_valor: contrasena,
    });
    if (errPass) {
      console.error('Error actualizando SMTP_PASS en Vault:', errPass);
      return jsonResponse({ error: 'El correo se actualizó pero la contraseña falló. Intenta de nuevo.' }, 502);
    }

    // --- 5. Auditoría (NUNCA se guarda la contraseña) ---
    // Ajusta los nombres de columna si tu auditoria_log usa otros.
    const nombreAdmin = [perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno]
      .filter(Boolean)
      .join(' ');

    try {
      await supabaseAdmin.from('auditoria_log').insert({
        tabla: 'configuracion_smtp',
        id_registro: perfil.id_perfil_info,
        operacion: 'update',
        realizado_por: perfil.id_perfil_info,
        campos_cambios: { correo_nuevo: correo, cambiado_por: nombreAdmin },
      });
    } catch (auditErr) {
      console.error('No se pudo registrar la auditoría del cambio de SMTP:', auditErr);
    }

    return jsonResponse({ success: true, correo });
  } catch (err) {
    console.error('Error inesperado en admin-actualizar-smtp:', err);
    return jsonResponse({ error: 'Ocurrió un error inesperado.' }, 500);
  }
});