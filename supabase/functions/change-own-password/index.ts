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

    const { nueva_password } = await req.json()

    // Validar longitud de contraseña (igual que en el frontend, pero
    // validado también aquí porque esta función se puede llamar directo
    // sin pasar por la UI).
    if (!nueva_password || nueva_password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente admin para validar el token y actualizar contraseña
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    // 1. Validar el token y obtener el usuario autenticado
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      throw new Error("Token de autenticación inválido o expirado.")
    }

    // 2. Actualizar la contraseña del PROPIO usuario (identificado por el token)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: nueva_password }
    )

    if (updateError) throw new Error(updateError.message)

    // 3. Revocar el resto de sesiones activas de este usuario (otros dispositivos/pestañas
    // donde haya iniciado sesión antes). La sesión actual, que recibirá una respuesta
    // exitosa y puede volver a loguearse con la contraseña nueva, no se ve afectada
    // porque el frontend la reemplaza de inmediato tras este cambio.
    // (auth.admin.signOut necesita el JWT de una sesión puntual, no un user_id;
    // por eso esto se resuelve con un RPC a una función SECURITY DEFINER que
    // borra las sesiones de este usuario directo en el esquema auth.)
    const { error: signOutError } = await supabaseAdmin.rpc('revocar_sesiones_usuario', {
      p_auth_usuario: user.id,
    })
    if (signOutError) {
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