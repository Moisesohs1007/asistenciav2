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
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const colegioId = typeof body.colegioId === 'string' ? body.colegioId.trim() : '';
    const dni = typeof body.dni === 'string' ? body.dni.trim() : '';
    const emailReal = typeof body.emailReal === 'string' ? body.emailReal.trim().toLowerCase() : '';

    if (!password || !colegioId || !dni) {
      return jsonResponse({ error: 'Faltan parámetros requeridos (dni, password, colegioId)', code: 'bad-request' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres', code: 'auth/weak-password' }, 400);
    }
    const alumnoId = dni.replace(/\D/g, '');
    if (!/^\d{8}$/.test(alumnoId)) {
      return jsonResponse({ error: 'DNI inválido', code: 'bad-request' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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
    if (email && email !== emailVirtual) {
      return jsonResponse({ error: 'Email no permitido para apoderados', code: 'not-allowed' }, 403);
    }

    const { data: alumno, error: alumnoError } = await supabaseAdmin
      .from('alumnos')
      .select('id')
      .eq('colegio_id', colegioId)
      .eq('id', alumnoId)
      .maybeSingle();

    if (alumnoError || !alumno) {
      return jsonResponse({ error: 'Alumno no encontrado', code: 'not-found' }, 404);
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: emailVirtual,
      password,
      email_confirm: true,
      app_metadata: { colegio_id: colegioId, rol: 'apoderado', alumno_id: alumnoId },
    });

    if (createError || !created?.user) {
      const msg = (createError as any)?.message || 'Error creando usuario';
      const code = msg.toLowerCase().includes('already') ? 'auth/email-already-in-use' : 'auth/unknown';
      return jsonResponse({ error: msg, code }, code === 'auth/email-already-in-use' ? 409 : 500);
    }

    // Guardar correo real solo como contacto (opcional)
    if (emailReal && /^[^@]+@[^@]+\.[^@]+$/.test(emailReal)) {
      try {
        const { error: upErr } = await supabaseAdmin.from('apoderados').upsert(
          { colegio_id: colegioId, id: alumnoId, alumno_id: alumnoId, email_real: emailReal, primer_ingreso: true },
          { onConflict: 'colegio_id,id' }
        );
        if (upErr) {
          // No bloquear la creación si la tabla/columna no existe
        }
      } catch (_) {
        // Ignorar
      }
    }

    return jsonResponse({ user: { id: created.user.id, email: created.user.email } }, 200);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Error interno', code: 'internal' }, 500);
  }
});

