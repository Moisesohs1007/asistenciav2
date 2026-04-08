import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Manejo de CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Obtener los datos del body (el mensaje y el número)
    const { telefono, mensaje, urlImagen } = await req.json();

    if (!telefono || !mensaje) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros requeridos (telefono, mensaje)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verificar que la petición viene de un usuario autenticado en Supabase
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

    // 3. Obtener el token de Factiliza desde la tabla colegios de Supabase
    //    El usuario (apoderado o staff) debe tener un colegio_id en sus metadata
    const colegioId = user.app_metadata.colegio_id;
    if (!colegioId) {
      return new Response(JSON.stringify({ error: 'Usuario no asociado a un colegio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Consultamos usando la llave service_role para bypassear RLS si es necesario, 
    // o el propio cliente autenticado si el RLS le permite leer factiliza_token.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // 4. Enviar el mensaje a través de Factiliza
    const tokenFactiliza = colegio.factiliza_token;
    const instancia = colegio.factiliza_instancia;
    const num = '51' + telefono.replace(/\D/g, '');

    let responseFactiliza;

    if (urlImagen) {
      responseFactiliza = await fetch(`https://apiwsp.factiliza.com/v1/message/sendimage/${instancia}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenFactiliza}`
        },
        body: JSON.stringify({ number: num, url: urlImagen, caption: mensaje })
      });
    } else {
      responseFactiliza = await fetch(`https://apiwsp.factiliza.com/v1/message/sendtext/${instancia}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenFactiliza}`
        },
        body: JSON.stringify({ number: num, text: mensaje })
      });
    }

    const dataFactiliza = await responseFactiliza.json();

    if (!responseFactiliza.ok) {
      return new Response(JSON.stringify({ error: 'Fallo al enviar en Factiliza', details: dataFactiliza }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Responder éxito
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
