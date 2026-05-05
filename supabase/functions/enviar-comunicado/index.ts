import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Método no permitido' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const urlImagen = typeof body.urlImagen === 'string' ? body.urlImagen : undefined;
    const mediaBase64 = typeof body.mediaBase64 === 'string' ? body.mediaBase64 : '';
    const filename = typeof body.filename === 'string' ? body.filename : '';
    const mediatypeIn = typeof body.mediatype === 'string' ? body.mediatype : '';
    const mediatype = (mediatypeIn === 'document' || mediatypeIn === 'image' || mediatypeIn === 'video' || mediatypeIn === 'audio')
      ? mediatypeIn
      : ((filename || '').toLowerCase().endsWith('.pdf') ? 'document' : 'image');
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros requeridos (items)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (items.length > 80) {
      return new Response(JSON.stringify({ error: 'Demasiados destinatarios (máximo 80)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!urlImagen && (!mediaBase64 || !filename)) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros requeridos (urlImagen o mediaBase64+filename)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const colegioId = user.app_metadata?.colegio_id;
    const rolMeta = String(user.app_metadata?.rol || '');
    if (!colegioId) {
      return new Response(JSON.stringify({ error: 'Usuario no asociado a un colegio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: usrRow, error: usrErr } = await supabaseAdmin
      .from('usuarios')
      .select('rol,permisos_extra')
      .eq('colegio_id', colegioId)
      .eq('id', user.id)
      .maybeSingle();

    if (usrErr) {
      return new Response(JSON.stringify({ error: usrErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rolDb = String((usrRow as any)?.rol || '');
    const rol = rolDb || rolMeta;
    const px = ((usrRow as any)?.permisos_extra && typeof (usrRow as any)?.permisos_extra === 'object')
      ? (usrRow as any)?.permisos_extra
      : {};
    const extraSections = (px && typeof px.sections === 'object') ? px.sections : {};
    const canByRole = ['admin', 'director', 'coordinador', 'profesor', 'psicologo'].includes(rol);
    const canByExtra = !!(extraSections as any)?.comunicado;

    if (!canByRole && !canByExtra) {
      return new Response(JSON.stringify({ error: 'No permitido' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: colegio, error: colegioError } = await supabaseAdmin
      .from('colegios')
      .select('factiliza_token, factiliza_instancia')
      .eq('id', colegioId)
      .single();

    if (colegioError || !colegio || !colegio.factiliza_token || !colegio.factiliza_instancia) {
      return new Response(JSON.stringify({ error: 'Configuración de WhatsApp no disponible para este colegio' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenFactiliza = colegio.factiliza_token;
    const instancia = colegio.factiliza_instancia;
    const instanciaSafe = encodeURIComponent(String(instancia || '').trim());
    const factilizaBase = 'https://apiwsp.factiliza.com';
    const factilizaHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenFactiliza}`,
    };

    async function sendFactiliza(num: string, mensaje: string) {
      if (mediaBase64 && filename) {
        const resNew = await fetch(`${factilizaBase}/api/v1/message/sendMedia/${instanciaSafe}`, {
          method: 'POST',
          headers: factilizaHeaders,
          body: JSON.stringify({ number: num, mediatype, media: mediaBase64, filename, caption: mensaje }),
        });
        if (resNew.status !== 404 || !urlImagen) return resNew;
      }

      if (urlImagen) {
        const resNew = await fetch(`${factilizaBase}/api/v1/message/sendMedia/${instanciaSafe}`, {
          method: 'POST',
          headers: factilizaHeaders,
          body: JSON.stringify({ number: num, mediatype: 'image', media: urlImagen, caption: mensaje }),
        });
        if (resNew.status !== 404) return resNew;
        return await fetch(`${factilizaBase}/v1/message/sendimage/${instanciaSafe}`, {
          method: 'POST',
          headers: factilizaHeaders,
          body: JSON.stringify({ number: num, url: urlImagen, caption: mensaje }),
        });
      }

      const resNew = await fetch(`${factilizaBase}/api/v1/message/sendText/${instanciaSafe}`, {
        method: 'POST',
        headers: factilizaHeaders,
        body: JSON.stringify({ number: num, text: mensaje, numero: num, texto: mensaje }),
      });
      if (resNew.status !== 404) return resNew;
      return await fetch(`${factilizaBase}/v1/message/sendtext/${instanciaSafe}`, {
        method: 'POST',
        headers: factilizaHeaders,
        body: JSON.stringify({ number: num, text: mensaje }),
      });
    }

    const results: any[] = [];
    for (const it of items) {
      const telefono = typeof it?.telefono === 'string' ? it.telefono : '';
      const mensaje = typeof it?.mensaje === 'string' ? it.mensaje : '';
      let digits = telefono.replace(/\D/g, '');
      if (digits.startsWith('0')) digits = digits.slice(1);
      if (digits.length === 9) digits = '51' + digits;
      const num = digits;

      if (!num || num.length < 11 || !mensaje) {
        results.push({ telefono, ok: false, status: 400, error: 'Número inválido o mensaje vacío' });
        continue;
      }

      const res = await sendFactiliza(num, mensaje);
      const txt = await res.text();
      let details: any = { raw: txt ?? '' };
      try { details = txt ? JSON.parse(txt) : { raw: '' }; } catch (e) {}
      results.push({ telefono: num, ok: res.ok, status: res.status, details });

      await sleep(1200);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
