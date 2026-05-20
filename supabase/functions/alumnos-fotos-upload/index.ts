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

function safeText(x: unknown) {
  return typeof x === 'string' ? x : '';
}

function isJpgName(name: string) {
  return /\.jpe?g$/i.test(name);
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

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceKey) return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurado' }, 500);
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey
    );

    const form = await req.formData();
    const dni = safeText(form.get('dni')).trim();
    const colegioIdBody = safeText(form.get('colegioId')).trim();
    const file = form.get('file');

    if (!/^\d{8}$/.test(dni)) return jsonResponse({ error: 'DNI inválido' }, 400);
    if (!(file instanceof File)) return jsonResponse({ error: 'Archivo requerido' }, 400);

    const rolMeta = safeText(user.app_metadata?.rol).trim().toLowerCase();
    const { data: requesterRows, error: requesterRowError } = await supabaseAdmin
      .from('usuarios')
      .select('colegio_id,rol,permisos_extra')
      .eq('id', user.id)
      .limit(1);

    if (requesterRowError) return jsonResponse({ error: requesterRowError.message }, 500);
    const requesterRow = Array.isArray(requesterRows) ? requesterRows[0] : null;
    const rolDb = safeText((requesterRow as any)?.rol).trim().toLowerCase();
    const colegioIdDb = safeText((requesterRow as any)?.colegio_id).trim();
    const permisosExtra = (requesterRow as any)?.permisos_extra || {};

    const colegioIdMeta = safeText(user.app_metadata?.colegio_id).trim();
    const colegioId = colegioIdDb || colegioIdMeta || colegioIdBody;
    if (!colegioId) return jsonResponse({ error: 'Usuario no asociado a un colegio' }, 400);
    if (colegioIdBody && colegioIdBody !== colegioId) return jsonResponse({ error: 'colegioId no coincide' }, 403);

    const rol = rolDb || rolMeta;
    const okRole = ['admin', 'director', 'coordinador'].includes(rol);
    const okPerm = !!(permisosExtra && (permisosExtra as any)?.alumnosFotosMasivo);
    if (!okRole && !okPerm) return jsonResponse({ error: 'No permitido' }, 403);
    if (colegioIdDb && colegioIdDb !== colegioId) return jsonResponse({ error: 'Usuario no asociado a este colegio' }, 403);

    const ext = isJpgName(file.name) ? 'jpg' : 'jpg';
    const path = `${colegioId}/${dni}.${ext}`;
    const bytes = await file.arrayBuffer();
    const bytesLen = bytes.byteLength;

    const { error: upError } = await supabaseAdmin
      .storage
      .from('alumnos-fotos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

    if (upError) {
      await supabaseAdmin.from('alumnos_fotos_upload_log').insert({
        colegio_id: colegioId,
        actor_uid: user.id,
        actor_email: user.email || null,
        actor_rol: rol,
        dni,
        path,
        bytes: bytesLen,
        mime: 'image/jpeg',
        ok: false,
        error: upError.message,
        source: 'edge',
      }).catch(() => {});
      return jsonResponse({ error: upError.message }, 500);
    }

    const base = String(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    const url = `${base}/storage/v1/object/public/alumnos-fotos/${encodeURIComponent(colegioId)}/${encodeURIComponent(dni)}.${ext}`;

    const { error: updError } = await supabaseAdmin
      .from('alumnos')
      .update({ foto: url })
      .eq('colegio_id', colegioId)
      .eq('id', dni);

    if (updError) {
      await supabaseAdmin.from('alumnos_fotos_upload_log').insert({
        colegio_id: colegioId,
        actor_uid: user.id,
        actor_email: user.email || null,
        actor_rol: rol,
        dni,
        path,
        bytes: bytesLen,
        mime: 'image/jpeg',
        ok: false,
        error: updError.message,
        source: 'edge',
      }).catch(() => {});
      return jsonResponse({ error: updError.message }, 500);
    }

    await supabaseAdmin.from('alumnos_fotos_upload_log').insert({
      colegio_id: colegioId,
      actor_uid: user.id,
      actor_email: user.email || null,
      actor_rol: rol,
      dni,
      path,
      bytes: bytesLen,
      mime: 'image/jpeg',
      ok: true,
      error: null,
      source: 'edge',
    }).catch(() => {});

    return jsonResponse({ ok: true, dni, path, url }, 200);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Error interno' }, 500);
  }
});
