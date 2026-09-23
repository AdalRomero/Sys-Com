import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  // Manejo de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error("No autorizado. Token ausente.")
    }

    const { auth_usuario_id, nueva_password } = await req.json()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Crear cliente admin para todas las operaciones
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    // 1. Validar el token enviado en el Header
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      throw new Error("Token de autenticación inválido o expirado.")
    }

    // 2. Validar que el usuario sea administrador en la tabla perfil_info
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfil_info')
      .select('rol')
      .eq('auth_usuario', user.id)
      .single()

    if (perfilError || !perfil || perfil.rol !== 'administrador') {
      throw new Error("Permisos insuficientes. Solo los administradores pueden realizar esta acción.")
    }

    // 3. Validar longitud de contraseña (igual que en el frontend, pero
    // validado también aquí porque esta función se puede llamar directo
    // sin pasar por la UI).
    if (!nueva_password || nueva_password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.")
    }

    // 4. Actualizar contraseña del usuario objetivo
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      auth_usuario_id,
      { password: nueva_password }
    )

    if (updateError) throw new Error(updateError.message)

    // 4.5. Notificar al usuario objetivo en tiempo real. Esto es lo que
    // permite que la app lo interrumpa (modal + cierre de sesión) al
    // instante, aunque esté activamente interactuando con la app y sin
    // importar en qué dispositivo/pestaña esté — se apoya en el canal de
    // Realtime que la app ya mantiene abierto sobre la tabla
    // `notificaciones` (ver RealtimeProvider.tsx y AuthContext.tsx).
    const { data: perfilObjetivo, error: perfilObjetivoError } = await supabaseAdmin
      .from('perfil_info')
      .select('id_perfil_info')
      .eq('auth_usuario', auth_usuario_id)
      .maybeSingle()

    if (perfilObjetivoError) {
      console.error('No se pudo ubicar el perfil del usuario objetivo para notificar:', perfilObjetivoError.message)
    } else if (perfilObjetivo?.id_perfil_info) {
      const { error: notifError } = await supabaseAdmin.rpc('fn_crear_notificacion', {
        p_id_usuario: perfilObjetivo.id_perfil_info,
        p_titulo: 'Tu contraseña fue actualizada',
        p_descripcion: 'Un administrador cambió tu contraseña de acceso. Por seguridad, tu sesión se cerrará automáticamente.',
        p_tipo: 'alert',
        p_prioridad: 'urgente',
        p_tabla_referencia: 'seguridad_credenciales',
      })
      if (notifError) {
        // No hacemos throw: la contraseña sí se actualizó, esto es defensa extra.
        console.error('No se pudo notificar el cambio de credenciales:', notifError.message)
      }
    }

    // 5. Revocar TODAS las sesiones activas de ese usuario (otros dispositivos/pestañas).
    // Sin esto, el access_token que ya tenía emitido sigue funcionando hasta que
    // expira solo (por defecto hasta 1 hora), aunque la contraseña ya haya cambiado.
    // (auth.admin.signOut necesita el JWT de una sesión puntual, no un user_id;
    // por eso esto se resuelve con un RPC a una función SECURITY DEFINER que
    // borra las sesiones de este usuario directo en el esquema auth.)
    const { error: signOutError } = await supabaseAdmin.rpc('revocar_sesiones_usuario', {
      p_auth_usuario: auth_usuario_id,
    })
    if (signOutError) {
      // No hacemos throw: la contraseña sí se actualizó, esto es defensa extra.
      console.error('No se pudieron revocar las sesiones activas:', signOutError.message)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Contraseña actualizada exitosamente." 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})