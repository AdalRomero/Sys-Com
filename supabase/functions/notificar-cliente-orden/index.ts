import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  plantillaOrdenLevantada,
  plantillaOrdenEnProceso,
  plantillaOrdenCerrada,
  type OrdenParaCorreo,
} from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WebhookBody {
  tipo: 'levantada' | 'en_proceso' | 'cerrada';
  id_orden_servicio: string;
  observaciones_finales?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Solo el trigger de Postgres (con el secreto de Vault) puede llamar esto ──
  const secretEsperado = Deno.env.get('WEBHOOK_SECRET');
  const secretRecibido = req.headers.get('x-webhook-secret');
  if (!secretEsperado || secretRecibido !== secretEsperado) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { tipo, id_orden_servicio, observaciones_finales }: WebhookBody = await req.json();

    if (!tipo || !id_orden_servicio) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan tipo o id_orden_servicio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Traer la orden + cliente + empresa YA con los datos reales guardados ──
    // (a diferencia del frontend, aquí no dependemos de lo que el usuario
    // tenía cargado en memoria: leemos directo de la fila que el trigger
    // acaba de confirmar que existe).
    const { data: orden, error: errorOrden } = await supabase
      .from('orden_servicio')
      .select(`
        numero_orden, equipo, problema,
        cliente:clientes!orden_servicio_id_clientes_fkey (
          nombre, correo,
          empresa:empresa!clientes_empresa_fkey ( nombre, correo )
        )
      `)
      .eq('id_orden_servicio', id_orden_servicio)
      .single();

    if (errorOrden || !orden) {
      console.error('No se encontró la orden para notificar:', errorOrden);
      return new Response(JSON.stringify({ ok: false, error: 'Orden no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cliente = (orden as any).cliente ?? null;
    const empresa = cliente?.empresa ?? null;

    const destinatarios = Array.from(
      new Set([cliente?.correo, empresa?.correo].filter((c): c is string => Boolean(c && c.trim())))
    );

    if (destinatarios.length === 0) {
      console.warn(`Orden #${orden.numero_orden}: cliente/empresa sin correo, no se envía aviso.`);
      return new Response(JSON.stringify({ ok: true, skipped: 'sin correo de cliente/empresa' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const datosOrden: OrdenParaCorreo = {
      numero_orden: orden.numero_orden,
      equipo: orden.equipo,
      problema: orden.problema,
      clienteNombre: cliente?.nombre ?? null,
      empresaNombre: empresa?.nombre ?? null,
    };

    let plantilla: { asunto: string; html: string };
    if (tipo === 'levantada') {
      plantilla = plantillaOrdenLevantada(datosOrden);
    } else if (tipo === 'en_proceso') {
      plantilla = plantillaOrdenEnProceso(datosOrden);
    } else if (tipo === 'cerrada') {
      plantilla = plantillaOrdenCerrada(datosOrden, observaciones_finales ?? null);
    } else {
      return new Response(JSON.stringify({ ok: false, error: `tipo desconocido: ${tipo}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Reenvía al enviar-correo ya existente (mismo SMTP, sin duplicar código) ──
    const resEnvio = await fetch(`${supabaseUrl}/functions/v1/enviar-correo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ destino: destinatarios, asunto: plantilla.asunto, mensaje: plantilla.html }),
    });

    const resultado = await resEnvio.json();
    if (!resEnvio.ok || !resultado.ok) {
      console.error('enviar-correo falló:', resultado);
      return new Response(JSON.stringify({ ok: false, error: resultado.error ?? 'Error al enviar correo' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
