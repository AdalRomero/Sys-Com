import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const TIEMPO_MINIMO_RESPUESTA_MS = 900
const VENTANA_CONTEO_MS = 15 * 60 * 1000
const LIMITE_FILAS = 60

function calcularBloqueoCuentaMs(fallosRecientes: number): number {
  if (fallosRecientes >= 15) return 60 * 60 * 1000
  if (fallosRecientes >= 10) return 15 * 60 * 1000
  if (fallosRecientes >= 5) return 5 * 60 * 1000
  return 0
}

function calcularBloqueoIpMs(fallosRecientes: number): number {
  if (fallosRecientes >= 60) return 60 * 60 * 1000
  if (fallosRecientes >= 30) return 15 * 60 * 1000
  if (fallosRecientes >= 20) return 5 * 60 * 1000
  return 0
}

const obtenerIp = (req: Request): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('cf-connecting-ip') ||
  'desconocida'

// HMAC-SHA256 determinista: mismo IP -> mismo hash siempre (necesario
// para poder comparar "WHERE ip_hash = ..."), pero irreversible sin la
// clave secreta (IP_HASH_SECRET), que solo vive en el entorno de esta
// función. A diferencia de un SHA-256 simple, esto resiste fuerza bruta
// sobre el espacio de IPv4 (~4 mil millones de valores) porque el
// atacante necesitaría también la clave, no solo la tabla filtrada.
async function hashearIp(ip: string, secreto: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const firma = await crypto.subtle.sign('HMAC', key, enc.encode(ip))
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function calcularEsperaMs(
  fallos: { created: string }[],
  calcularNivelMs: (cantidad: number) => number
): number {
  const nivelMs = calcularNivelMs(fallos.length)
  if (nivelMs === 0 || fallos.length === 0) return 0
  const ultimoFallo = new Date(fallos[0].created).getTime()
  const desbloqueaEn = ultimoFallo + nivelMs
  return Math.max(0, desbloqueaEn - Date.now())
}

Deno.serve(async (req) => {
  const inicio = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const responder = async (body: Record<string, unknown>, status: number) => {
    const transcurrido = Date.now() - inicio
    const restante = TIEMPO_MINIMO_RESPUESTA_MS - transcurrido
    if (restante > 0) {
      await new Promise((resolve) => setTimeout(resolve, restante))
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (req.method !== 'POST') {
      return await responder({ success: false, error: 'Método no permitido.' }, 405)
    }

    const { email, password } = await req.json().catch(() => ({}))

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return await responder({ success: false, error: 'Correo o contraseña incorrectos.' }, 400)
    }

    const emailNormalizado = email.trim().toLowerCase()
    const ip = obtenerIp(req)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const ipHashSecret = Deno.env.get('IP_HASH_SECRET')!
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const ipHash = await hashearIp(ip, ipHashSecret)
    const desde = new Date(Date.now() - VENTANA_CONTEO_MS).toISOString()

    const [{ data: fallosCuenta }, { data: fallosIp }] = await Promise.all([
      supabaseAdmin
        .from('login_intentos')
        .select('created')
        .eq('email', emailNormalizado)
        .eq('exitoso', false)
        .gte('created', desde)
        .order('created', { ascending: false })
        .limit(LIMITE_FILAS),
      supabaseAdmin
        .from('login_intentos')
        .select('created')
        .eq('ip_hash', ipHash)
        .eq('exitoso', false)
        .gte('created', desde)
        .order('created', { ascending: false })
        .limit(LIMITE_FILAS),
    ])

    const esperaCuentaMs = calcularEsperaMs(fallosCuenta ?? [], calcularBloqueoCuentaMs)
    const esperaIpMs = calcularEsperaMs(fallosIp ?? [], calcularBloqueoIpMs)
    const esperaMs = Math.max(esperaCuentaMs, esperaIpMs)

    if (esperaMs > 0) {
      return await responder(
        {
          success: false,
          error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.',
          locked: true,
          retry_after_seconds: Math.ceil(esperaMs / 1000),
        },
        429
      )
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey)
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: emailNormalizado,
      password,
    })

    const registro = supabaseAdmin.from('login_intentos').insert({
      email: emailNormalizado,
      ip_hash: ipHash,
      exitoso: !error && !!data.session,
    })

    if (Math.random() < 0.02) {
      const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      supabaseAdmin.from('login_intentos').delete().lt('created', haceUnDia).then(
        () => {},
        () => {}
      )
    }

    await registro

    if (error || !data.session) {
      return await responder({ success: false, error: 'Correo o contraseña incorrectos.' }, 401)
    }

    return await responder(
      {
        success: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      },
      200
    )
  } catch (e: any) {
    console.error('Error inesperado en login:', e?.message)
    return await responder({ success: false, error: 'Ocurrió un error inesperado.' }, 500)
  }
})