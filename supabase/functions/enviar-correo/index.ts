import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from "https://deno.land/x/denomailer/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  destino: string | string[];
  asunto: string;
  mensaje: string;
}

// Límite normal para usuarios humanos desde la app.
const LIMITE_CORREOS_POR_MINUTO_USUARIO = 10;
// Límite más alto para llamadas internas (notificar-cliente-orden), por si
// se cierran/abren varias órdenes seguidas -- sigue acotado por si algo
// entra en loop, pero no estorba el uso normal.
const LIMITE_CORREOS_POR_MINUTO_INTERNO = 60;

const contadorPorIdentidad = new Map<string, { count: number; resetAt: number }>();

function excedeLimite(identidad: string, limite: number): boolean {
  const ahora = Date.now();
  const registro = contadorPorIdentidad.get(identidad);

  if (!registro || ahora > registro.resetAt) {
    contadorPorIdentidad.set(identidad, { count: 1, resetAt: ahora + 60_000 });
    return false;
  }

  registro.count += 1;
  return registro.count > limite;
}

function limpiarAsunto(asunto: string): string {
  return asunto.replace(/[\r\n]+/g, " ").trim();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Paso 1: identificar quién llama ────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return responder({ ok: false, error: "No autorizado." }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let identidad: string;
    let limitePorMinuto: number;

    if (token === serviceKey) {
      // Llamada interna confiable (ej. notificar-cliente-orden). La
      // service_role key nunca se expone al navegador, solo la conocen
      // nuestras propias Edge Functions -- por eso comparar por igualdad
      // directa es suficiente, sin pasar por auth.getUser().
      identidad = "internal:service_role";
      limitePorMinuto = LIMITE_CORREOS_POR_MINUTO_INTERNO;
    } else {
      // Llamada de un usuario humano desde la app -- exige sesión real.
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return responder({ ok: false, error: "Sesión inválida o expirada." }, 401);
      }
      identidad = user.id;
      limitePorMinuto = LIMITE_CORREOS_POR_MINUTO_USUARIO;
    }

    // ── Paso 2: rate limiting ──────────────────────────────────────
    if (excedeLimite(identidad, limitePorMinuto)) {
      return responder(
        { ok: false, error: "Demasiados correos enviados. Intenta de nuevo en un minuto." },
        429
      );
    }

    // ── Paso 3: validar body ──────────────────────────────────────
    const { destino, asunto, mensaje }: RequestBody = await req.json();

    const destinatarios = (Array.isArray(destino) ? destino : [destino])
      .filter(Boolean)
      .map((d) => d.trim());

    if (destinatarios.length === 0 || !asunto || !mensaje) {
      return responder({ ok: false, error: "Faltan campos requeridos" }, 400);
    }
    if (destinatarios.length > 20) {
      return responder({ ok: false, error: "Demasiados destinatarios en un solo envío." }, 400);
    }
    const destinatariosInvalidos = destinatarios.filter((d) => !EMAIL_REGEX.test(d));
    if (destinatariosInvalidos.length > 0) {
      return responder(
        { ok: false, error: `Correo(s) inválido(s): ${destinatariosInvalidos.join(", ")}` },
        400
      );
    }

    const asuntoLimpio = limpiarAsunto(asunto);
    const mensajeMinificado = mensaje.replace(/>\s+</g, "><").trim();

    // ── Paso 4: obtener credenciales SMTP desde Vault ──────────────
    // Ya NO se leen de Deno.env -- viven cifradas en Supabase Vault y
    // se actualizan desde el panel de administración (admin-actualizar-smtp).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
    );

    const { data: smtpUser, error: errUser } = await supabaseAdmin
      .rpc('fn_obtener_secreto_smtp', { p_nombre: 'SMTP_USER' });
    const { data: smtpPass, error: errPass } = await supabaseAdmin
      .rpc('fn_obtener_secreto_smtp', { p_nombre: 'SMTP_PASS' });

    if (errUser || errPass || !smtpUser || !smtpPass) {
      console.error('No se pudieron obtener credenciales SMTP desde Vault:', errUser, errPass);
      return responder({ ok: false, error: "Error de configuración SMTP." }, 500);
    }

    // ── Paso 5: enviar el correo ────────────────────────────────────
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
      encodeLB: true,
    });

    const nombreRemitente = Deno.env.get("SMTP_FROM_NAME") ?? "Bot de Syscom";
    const correoRemitente = smtpUser;

    await client.send({
      from: `${nombreRemitente} <${correoRemitente}>`,
      to: destinatarios,
      subject: asuntoLimpio,
      content: "auto",
      html: mensajeMinificado,
    });

    await client.close();

    return responder({ ok: true });
  } catch (err) {
    console.error(err);
    return responder({ ok: false, error: (err as Error).message }, 500);
  }
});