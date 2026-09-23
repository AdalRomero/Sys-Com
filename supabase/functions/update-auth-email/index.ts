import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No autorizado. Token ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { auth_usuario_id, nuevo_correo } = await req.json()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Configuración de servidor incompleta")
    }

    // Client 1: Con las credenciales del usuario que hace la solicitud para validar su sesión
    const supabaseUserClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Obtenemos el usuario real autenticado desde el JWT enviado
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de autenticación inválido o expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Buscamos el rol de este usuario en tu tabla pública perfil_info
    const { data: perfil, error: perfilError } = await supabaseUserClient
      .from('perfil_info')
      .select('rol')
      .eq('auth_usuario', user.id)
      .single()

    if (perfilError || !perfil) {
      return new Response(
        JSON.stringify({ success: false, error: "No se encontró un perfil asignado a tus credenciales." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 🛡️ REGLA DE SEGURIDAD CRÍTICA: Validamos que sea estrictamente 'administrador'
    if (perfil.rol !== 'administrador') {
      return new Response(
        JSON.stringify({ success: false, error: "Permisos insuficientes. Solo los administradores pueden realizar esta acción." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Client 2: Instancia maestra segura que ejecutará el cambio en auth.users
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    // Ejecuta el flujo seguro de actualización
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      auth_usuario_id,
      { email: nuevo_correo }
    )

    if (updateError) throw new Error(updateError.message)

    // Notificar al usuario objetivo en tiempo real. Esto es lo que permite
    // que la app lo interrumpa (modal + cierre de sesión) al instante,
    // aunque esté activamente interactuando con la app y sin importar en
    // qué dispositivo/pestaña esté — se apoya en el canal de Realtime que
    // la app ya mantiene abierto sobre la tabla `notificaciones` (ver
    // RealtimeProvider.tsx y AuthContext.tsx).
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
        p_titulo: 'Tu correo de acceso fue actualizado',
        p_descripcion: 'Un administrador cambió tu correo de acceso. Por seguridad, tu sesión se cerrará automáticamente.',
        p_tipo: 'alert',
        p_prioridad: 'urgente',
        p_tabla_referencia: 'seguridad_credenciales',
      })
      if (notifError) {
        console.error('No se pudo notificar el cambio de credenciales:', notifError.message)
      }
    }

    // Revocar TODAS las sesiones activas de ese usuario (otros dispositivos/pestañas).
    // Sin esto, el access_token que ya tenía emitido sigue funcionando hasta que
    // expira solo, aunque el correo ya haya cambiado.
    // (auth.admin.signOut necesita el JWT de una sesión puntual, no un user_id;
    // por eso esto se resuelve con un RPC a una función SECURITY DEFINER que
    // borra las sesiones de este usuario directo en el esquema auth.)
    const { error: signOutError } = await supabaseAdmin.rpc('revocar_sesiones_usuario', {
      p_auth_usuario: auth_usuario_id,
    })
    if (signOutError) {
      console.error('No se pudieron revocar las sesiones activas:', signOutError.message)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Se ha enviado la solicitud de verificación a las direcciones correspondientes." 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: String(e.message) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})