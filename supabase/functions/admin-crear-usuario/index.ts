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

const STAFF_ROLES = new Set(['admin', 'director', 'coordinador', 'profesor', 'psicologo', 'auxiliar', 'portero']);

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requesterRolMeta = String(user.app_metadata?.rol || '');
    const colegioIdMeta = String(user.app_metadata?.colegio_id || '');

    const { data: requesterRows, error: requesterRowError } = await supabaseAdmin
      .from('usuarios')
      .select('colegio_id,rol')
      .eq('id', user.id)
      .limit(1);

    if (requesterRowError) return jsonResponse({ error: requesterRowError.message }, 500);
    const requesterRow = Array.isArray(requesterRows) ? requesterRows[0] : null;
    const requesterRolDb = String((requesterRow as any)?.rol || '');
    const colegioIdDb = String((requesterRow as any)?.colegio_id || '');

    const requesterRol = requesterRolDb || requesterRolMeta;
    const colegioId = colegioIdDb || colegioIdMeta;

    if (!colegioId) return jsonResponse({ error: 'Usuario no asociado a un colegio' }, 400);
    if (!['admin', 'director'].includes(requesterRol)) return jsonResponse({ error: 'No permitido' }, 403);

    if (requesterRolMeta !== requesterRol || colegioIdMeta !== colegioId) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...(user.app_metadata || {}), colegio_id: colegioId, rol: requesterRol },
      }).catch(() => {});
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    let rol = typeof body.rol === 'string' ? body.rol.trim() : '';
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const cargo = typeof body.cargo === 'string' ? body.cargo.trim() : '';
    const telefono = typeof body.telefono === 'string' ? body.telefono.trim() : '';
    const restringir = !!body.restringir;
    const asignaciones = typeof body.asignaciones === 'object' && body.asignaciones ? body.asignaciones : {};
    const esTutor = !!body.esTutor;
    const tutorGrado = typeof body.tutorGrado === 'string' ? body.tutorGrado.trim() : null;
    const tutorSeccion = typeof body.tutorSeccion === 'string' ? body.tutorSeccion.trim() : null;
    const incidentesDiaLectura = !!body.incidentesDiaLectura;

    rol = rol.toLowerCase();
    if (rol === 'portero') rol = 'auxiliar';

    if (!email || !password || !rol || !nombre) {
      return jsonResponse({ error: 'Faltan parámetros requeridos (email, password, rol, nombre)' }, 400);
    }
    if (!STAFF_ROLES.has(rol)) return jsonResponse({ error: 'Rol inválido' }, 400);
    if (requesterRol === 'director' && rol === 'admin') return jsonResponse({ error: 'No permitido' }, 403);
    if (password.length < 6) return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return jsonResponse({ error: 'Correo inválido' }, 400);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { colegio_id: colegioId, rol },
    });

    if (createError || !created?.user) {
      const msg = (createError as any)?.message || 'Error creando usuario';
      const code = msg.toLowerCase().includes('already') ? 'auth/email-already-in-use' : 'auth/unknown';
      return jsonResponse({ error: msg, code }, code === 'auth/email-already-in-use' ? 409 : 500);
    }

    const uid = created.user.id;
    const row: Record<string, unknown> = {
      id: uid,
      colegio_id: colegioId,
      nombre,
      email,
      rol,
      cargo,
      telefono,
      restringir,
      asignaciones,
      es_tutor: esTutor && rol === 'profesor',
      tutor_grado: esTutor && rol === 'profesor' ? tutorGrado : null,
      tutor_seccion: esTutor && rol === 'profesor' ? tutorSeccion : null,
      incidentes_dia_lectura: incidentesDiaLectura,
    };

    const { error: upsertError } = await supabaseAdmin
      .from('usuarios')
      .upsert(row, { onConflict: 'colegio_id,id' });

    if (upsertError) {
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      return jsonResponse({ error: upsertError.message }, 500);
    }

    return jsonResponse({ user: { id: uid, email } }, 200);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Error interno' }, 500);
  }
});

