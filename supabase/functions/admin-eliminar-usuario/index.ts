import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'No autorizado' }, 401);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Token inválido o expirado' }, 401);

    const requesterRol = String(user.app_metadata?.rol || '');
    const colegioId = String(user.app_metadata?.colegio_id || '');
    if (!colegioId) return jsonResponse({ error: 'Usuario no asociado a un colegio' }, 400);
    if (!['admin', 'director'].includes(requesterRol)) return jsonResponse({ error: 'No permitido' }, 403);

    const body = await req.json().catch(() => ({}));
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!uid) return jsonResponse({ error: 'Falta uid' }, 400);
    if (uid === user.id) return jsonResponse({ error: 'No permitido' }, 403);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabaseAdmin.from('usuarios').delete().eq('colegio_id', colegioId).eq('id', uid);
    const { error: delAuthError } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (delAuthError) return jsonResponse({ error: delAuthError.message }, 500);

    return jsonResponse({ success: true }, 200);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Error interno' }, 500);
  }
});

