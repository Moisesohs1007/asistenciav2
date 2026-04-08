import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const telefono = typeof body.telefono === 'string' ? body.telefono : '';
    const mensaje = typeof body.mensaje === 'string' ? body.mensaje : '';
    const urlImagen = typeof body.urlImagen === 'string' ? body.urlImagen : undefined;

    if (!telefono || !mensaje) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros requeridos (telefono, mensaje)' }), {
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
    const rol = user.app_metadata?.rol;
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

    if (rol === 'apoderado') {
      const alumnoId = user.app_metadata?.alumno_id;
      if (!alumnoId) {
        return new Response(JSON.stringify({ error: 'Usuario no asociado a un alumno' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: alumno, error: alumnoError } = await supabaseAdmin
        .from('alumnos')
        .select('telefono, telefono2')
        .eq('colegio_id', colegioId)
        .eq('id', alumnoId)
        .single();
      if (alumnoError || !alumno) {
        return new Response(JSON.stringify({ error: 'Alumno no encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const input9 = telefono.replace(/\D/g, '').slice(-9);
      const tel1 = (alumno.telefono || '').replace(/\D/g, '').slice(-9);
      const tel2 = (alumno.telefono2 || '').replace(/\D/g, '').slice(-9);
      if (!input9 || (input9 !== tel1 && input9 !== tel2)) {
        return new Response(JSON.stringify({ error: 'No permitido' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (!['admin', 'director', 'profesor', 'portero'].includes(String(rol || ''))) {
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
    let digits = telefono.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 9) digits = '51' + digits;
    const num = digits;
    if (!num || num.length < 11) {
      return new Response(JSON.stringify({ error: 'Número inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanciaSafe = encodeURIComponent(String(instancia || '').trim());
    const factilizaBase = 'https://apiwsp.factiliza.com';
    const factilizaHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenFactiliza}`,
    };

    async function sendFactiliza() {
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

    const responseFactiliza = await sendFactiliza();

    const txt = await responseFactiliza.text();
    let dataFactiliza: any = { raw: txt ?? '' };
    try { dataFactiliza = txt ? JSON.parse(txt) : { raw: '' }; } catch (e) {}

    if (!responseFactiliza.ok) {
      return new Response(JSON.stringify({
        error: 'Fallo al enviar en Factiliza',
        factilizaStatus: responseFactiliza.status,
        details: dataFactiliza,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'WhatsApp enviado' }), {
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
