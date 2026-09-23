import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 0. AUTORIZACIÓN -- esta función borra CUALQUIER cuenta de Auth por
    // id. Antes no verificaba quién la llamaba: cualquiera con la anon key
    // podía borrar la cuenta de otra persona (incluida la de un
    // administrador) sin sesión ni permisos. Se exige ahora sesión válida
    // y rol 'administrador'.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No autorizado. Token ausente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: usuarioSolicitante }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !usuarioSolicitante) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token de autenticación inválido o expirado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { data: perfilSolicitante, error: perfilSolicitanteError } = await supabaseAdmin
      .from('perfil_info')
      .select('rol')
      .eq('auth_usuario', usuarioSolicitante.id)
      .single()

    if (perfilSolicitanteError || !perfilSolicitante || perfilSolicitante.rol !== 'administrador') {
      return new Response(
        JSON.stringify({ success: false, error: 'Permisos insuficientes. Solo los administradores pueden eliminar usuarios.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Obtenemos el ID de autenticación (el UUID de auth.users) enviado desde el frontend
    const { id } = await req.json()

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID de usuario (auth) requerido.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // No permitir que un administrador se borre a sí mismo por accidente
    // (o vía un script) y se quede fuera del sistema sin querer.
    if (id === usuarioSolicitante.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'No puedes eliminar tu propia cuenta.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // PASO 1: Desvincular en la tabla pública poniendo en null la referencia de auth_usuario
    const { error: dbError } = await supabaseAdmin
      .from('perfil_info')
      .update({ auth_usuario: null })
      .eq('auth_usuario', id)

    if (dbError) {
      throw new Error(`Error al desvincular el perfil público: ${dbError.message}`)
    }

    // PASO 2: Ahora que el enlace está roto, eliminamos permanentemente las credenciales (Email/Password)
    const { error: authErrorDelete } = await supabaseAdmin.auth.admin.deleteUser(id)

    if (authErrorDelete) {
      throw new Error(`Error al eliminar credenciales de Auth: ${authErrorDelete.message}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})