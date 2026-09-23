import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { persistSession: false, autoRefreshToken: false }
      }
    )

    // 0. AUTORIZACIÓN -- sin esto, cualquiera con la anon key podía disparar
    // correos de restablecimiento hacia cualquier perfil a voluntad (spam /
    // acoso) y usar la respuesta para enumerar qué perfiles tienen correo
    // registrado o cuenta de Auth creada.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No autorizado. Token ausente." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de autenticación inválido o expirado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      )
    }

    const { data: perfilSolicitante, error: perfilSolicitanteError } = await supabaseAdmin
      .from('perfil_info')
      .select('rol')
      .eq('auth_usuario', user.id)
      .single()

    if (perfilSolicitanteError || !perfilSolicitante || perfilSolicitante.rol !== 'administrador') {
      return new Response(
        JSON.stringify({ success: false, error: "Permisos insuficientes. Solo los administradores pueden restablecer contraseñas." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      )
    }

    const { id_perfil_info } = await req.json()

    if (!id_perfil_info) {
      return new Response(
        JSON.stringify({ success: false, error: "El ID de perfil es obligatorio." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // 1. Obtener el perfil del usuario para extraer el 'auth_usuario' si existe
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfil_info')
      .select('auth_usuario')
      .eq('id_perfil_info', id_perfil_info)
      .maybeSingle()

    if (perfilError || !perfil) {
      return new Response(
        JSON.stringify({ success: false, error: `No se encontró el perfil de usuario.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      )
    }

    let emailDestino = ''

    // 2. PRIORIDAD 1: Buscar en tu tabla 'public.contacto' usando el 'id_perfil_info'
    const { data: contacto } = await supabaseAdmin
      .from('contacto')
      .select('correo_personal')
      .eq('id_perfil_info', id_perfil_info)
      .maybeSingle()

    if (contacto?.correo_personal && contacto.correo_personal.trim() !== '') {
      emailDestino = contacto.correo_personal.trim()
    }
    // 3. PRIORIDAD 2: Si no tiene correo personal, lo buscamos en la tabla interna de Supabase Auth usando 'auth_usuario'
    else if (perfil.auth_usuario) {
      const { data: authData, error: authErrorLookup } = await supabaseAdmin.auth.admin.getUserById(perfil.auth_usuario)
      if (!authErrorLookup && authData?.user?.email) {
        emailDestino = authData.user.email
      }
    }

    // 4. Si tras buscar en ambas tablas no se localizó ningún correo válido
    if (!emailDestino) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Este usuario no cuenta con un correo personal registrado ni tiene credenciales de acceso creadas en Auth."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // 5. Disparar el flujo nativo de restablecimiento de contraseña de Supabase
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(emailDestino, {
      redirectTo: `https://syscom-servicios.vercel.app/auth/ActualizarCredenciales`,
    })

    if (resetError) {
      return new Response(
        JSON.stringify({ success: false, error: `Error en el servidor de Autenticación: ${resetError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // Retorno exitoso informando a la aplicación a qué correo se envió el enlace
    return new Response(
      JSON.stringify({
        success: true,
        message: `Correo de restablecimiento enviado exitosamente a: ${emailDestino}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})