import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo del preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Inicializar cliente de Supabase con Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // 0. AUTORIZACIÓN -- esta función vincula credenciales de acceso a
    // CUALQUIER id_perfil_info que se le pase. Antes no validaba quién la
    // llamaba: cualquiera con la anon key podía generar login para el
    // perfil de otra persona (incluido un administrador). Se exige ahora
    // que quien llama tenga sesión válida y rol 'administrador', igual que
    // en update-auth-email / update-auth-password.
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
        JSON.stringify({ success: false, error: "Permisos insuficientes. Solo los administradores pueden generar credenciales." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      )
    }

    // 2. Extraer parámetros del body (Ya sin el parámetro 'usuario')
    const { id_perfil_info, email, password } = await req.json()

    if (!id_perfil_info || !email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "El perfil, correo y contraseña son obligatorios." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: "La contraseña debe tener al menos 8 caracteres." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // 2.5. El perfil objetivo no debe tener ya credenciales vinculadas --
    // si no se valida esto, alguien podría reasignar/pisar el acceso de un
    // perfil que ya tiene auth_usuario, incluso el de otro administrador.
    const { data: perfilObjetivo, error: perfilObjetivoError } = await supabaseAdmin
      .from('perfil_info')
      .select('auth_usuario')
      .eq('id_perfil_info', id_perfil_info)
      .maybeSingle()

    if (perfilObjetivoError || !perfilObjetivo) {
      return new Response(
        JSON.stringify({ success: false, error: "No se encontró el perfil indicado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      )
    }

    if (perfilObjetivo.auth_usuario) {
      return new Response(
        JSON.stringify({ success: false, error: "Este perfil ya tiene credenciales de acceso vinculadas." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      )
    }

    // 3. Crear el usuario en Supabase Auth
    const { data: authData, error: authErrorCreate } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // Confirmación automática de correo
    })

    if (authErrorCreate) {
      return new Response(
        JSON.stringify({ success: false, error: `Error en Auth: ${authErrorCreate.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    const authUsuarioId = authData.user.id

    // 4. Actualizar la tabla de perfiles uniendo únicamente la relación de autenticación
    const { error: profileError } = await supabaseAdmin
      .from('perfil_info')
      .update({
        auth_usuario: authUsuarioId
      })
      .eq('id_perfil_info', id_perfil_info)

    if (profileError) {
      // Rollback: Si la base de datos falla, eliminamos la cuenta Auth generada
      await supabaseAdmin.auth.admin.deleteUser(authUsuarioId)

      return new Response(
        JSON.stringify({ success: false, error: `Error al vincular el perfil: ${profileError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // 5. Éxito
    return new Response(
      JSON.stringify({
        success: true,
        message: "Acceso generado y enlazado correctamente.",
        auth_usuario_id: authUsuarioId
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