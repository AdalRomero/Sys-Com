import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  // 1. Manejo de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 0. AUTORIZACIÓN -- esta función crea usuarios con el rol que se le
    // pida (incluido 'administrador'), así que antes que nada hay que
    // verificar que quien llama ya es administrador. Antes no había NINGÚN
    // chequeo aquí: cualquiera con la anon key podía crearse una cuenta de
    // admin directo, sin pasar por la UI ni por una sesión válida.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No autorizado. Token ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Configuración de servidor incompleta")
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de autenticación inválido o expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { data: perfilSolicitante, error: perfilSolicitanteError } = await supabaseAdmin
      .from('perfil_info')
      .select('rol')
      .eq('auth_usuario', user.id)
      .single()

    if (perfilSolicitanteError || !perfilSolicitante || perfilSolicitante.rol !== 'administrador') {
      return new Response(
        JSON.stringify({ success: false, error: "Permisos insuficientes. Solo los administradores pueden crear usuarios." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const usuarioData = await req.json()

    // Validación de contraseña también del lado servidor (esta función se
    // puede llamar directo, sin pasar por el formulario del frontend).
    if (!usuarioData.password || usuarioData.password.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: "La contraseña debe tener al menos 8 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

   // 2. Crear usuario en Auth con todos los metadatos necesarios
    const { data: authData, error: authErrorCreate } = await supabaseAdmin.auth.admin.createUser({
      email: usuarioData.correo_acceso,
      password: usuarioData.password,
      email_confirm: true,
      user_metadata: {
        usuario: usuarioData.usuario,
        nombres: usuarioData.nombres,
        apellido_paterno: usuarioData.apellido_paterno,
        apellido_materno: usuarioData.apellido_materno,
        rol: usuarioData.rol
      }
    })

    if (authErrorCreate) throw new Error("Error en Auth: " + authErrorCreate.message)
    const userId = authData.user.id

   // 3. Insertar en perfil_info
    const { data: nuevoPerfil, error: perfilError } = await supabaseAdmin
      .from('perfil_info')
      .insert({
        auth_usuario: userId,
        usuario: usuarioData.usuario,
        nombres: usuarioData.nombres,
        apellido_paterno: usuarioData.apellido_paterno,
        apellido_materno: usuarioData.apellido_materno,
        rol: usuarioData.rol
      })
      .select('id_perfil_info')
      .single()

    if (perfilError) {
      // Rollback: si falla la creación del perfil, no dejamos huérfana la
      // cuenta de Auth recién creada.
      await supabaseAdmin.auth.admin.deleteUser(userId)
      throw new Error("Error creando perfil: " + perfilError.message)
    }
    const perfilId = nuevoPerfil.id_perfil_info

    // 4. Insertar en contacto
    const { error: contactoError } = await supabaseAdmin
      .from('contacto')
      .insert({
        id_perfil_info: perfilId,
        correo_personal: usuarioData.contacto.correo_personal,
        lada: usuarioData.contacto.lada,
        telefono: usuarioData.contacto.telefono,
        direccion: usuarioData.contacto.direccion
      })

    if (contactoError) throw new Error("Error creando contacto: " + contactoError.message)

    // Éxito total
    return new Response(
      JSON.stringify({ success: true, message: "Usuario creado correctamente" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String(e.message) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})