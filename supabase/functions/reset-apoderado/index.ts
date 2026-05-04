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
    const body = await req.json().catch(() => ({}));
    const colegioId = typeof body.colegioId === 'string' ? body.colegioId.trim() : '';
    const dni = typeof body.dni === 'string' ? body.dni.trim() : '';

    if (!colegioId || !dni) {
      return jsonResponse({ error: 'Faltan parámetros requeridos (dni, colegioId)', code: 'bad-request' }, 400);
    }
    const alumnoId = dni.replace(/\D/g, '');
    if (!/^\d{8}$/.test(alumnoId)) {
      return jsonResponse({ error: 'DNI inválido', code: 'bad-request' }, 400);
    }

    const authz = req.headers.get('authorization') || '';
    const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7) : '';
    if (!token) return jsonResponse({ error: 'No autorizado', code: 'unauthorized' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) {
      return jsonResponse({ error: 'No autorizado', code: 'unauthorized' }, 401);
    }

    const rol = String((caller.app_metadata as any)?.rol || '').toLowerCase();
    const callerColegio = String((caller.app_metadata as any)?.colegio_id || '').trim();
    if (rol !== 'admin' || callerColegio !== colegioId) {
      return jsonResponse({ error: 'No permitido', code: 'not-allowed' }, 403);
    }

    const { data: colegio, error: colegioError } = await supabaseAdmin
      .from('colegios')
      .select('id,apo_domain')
      .eq('id', colegioId)
      .single();

    if (colegioError || !colegio) {
      return jsonResponse({ error: 'Colegio no válido', code: 'invalid-colegio' }, 400);
    }

    const apoDomain = String((colegio as any).apo_domain || '').trim().toLowerCase();
    if (!apoDomain) {
      return jsonResponse({ error: 'Colegio sin apo_domain configurado', code: 'bad-request' }, 400);
    }

    const emailVirtual = `${alumnoId}@${apoDomain}`;

    const { data: alumno, error: alumnoError } = await supabaseAdmin
      .from('alumnos')
      .select('id')
      .eq('colegio_id', colegioId)
      .eq('id', alumnoId)
      .maybeSingle();

    if (alumnoError || !alumno) {
      return jsonResponse({ error: 'Alumno no encontrado', code: 'not-found' }, 404);
    }

    // Buscar el usuario por email
    let targetId = '';
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const found = (data?.users || []).find((u) => (u.email || '').toLowerCase() === emailVirtual);
      if (found?.id) { targetId = found.id; break; }
      if (!data?.users || data.users.length < 200) break;
    }

    if (!targetId) {
      // Si no existe, créalo
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: emailVirtual,
        password: alumnoId,
        email_confirm: true,
        app_metadata: { colegio_id: colegioId, rol: 'apoderado', alumno_id: alumnoId },
      });
      if (createError || !created?.user?.id) {
        return jsonResponse({ error: (createError as any)?.message || 'Error creando usuario', code: 'auth/unknown' }, 500);
      }
      targetId = created.user.id;
    } else {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
        password: alumnoId,
        app_metadata: { colegio_id: colegioId, rol: 'apoderado', alumno_id: alumnoId },
      });
      if (updErr) {
        return jsonResponse({ error: updErr.message, code: 'auth/update-failed' }, 500);
      }
    }

    // Marcar primer ingreso para forzar cambio de contraseña
    try {
      await supabaseAdmin.from('apoderados').upsert(
        { colegio_id: colegioId, id: alumnoId, alumno_id: alumnoId, primer_ingreso: true },
        { onConflict: 'colegio_id,id' }
      );
    } catch (_) {}

    return jsonResponse({ ok: true, email: emailVirtual }, 200);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Error interno', code: 'internal' }, 500);
  }
});

