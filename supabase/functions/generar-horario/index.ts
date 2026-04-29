import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { solveTimetable, type InputModel } from './solver.ts';

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

const STAFF_ROLES = new Set(['admin', 'director', 'coordinador', 'profesor', 'auxiliar', 'portero']);

function normalizeDays(days: unknown): string[] {
  if (!Array.isArray(days)) return [];
  return days.map(String).map(s => s.trim()).filter(Boolean);
}

function asInt(n: unknown, def = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.floor(v) : def;
}

async function buildModelFromDb(supabaseAdmin: any, colegioId: string): Promise<InputModel> {
  const [{ data: jornadas }, { data: slots }, { data: sections }, { data: teachers }, { data: demands }, { data: locales }, { data: travel }, { data: events }, { data: avail }] =
    await Promise.all([
      supabaseAdmin.from('horario_jornadas').select('id,nombre,tipo,nivel,compare_group,is_default').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_slots').select('jornada_id,day,slot_index,is_break').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_sections').select('id,nivel,grado,seccion,turno,local_base,jornada_id').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_teachers').select('id,nombre,local_base,locales_permitidos,max_horas_semana,preferencias').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_demands').select('section_id,course_id,teacher_id,hours_per_week,required_local_id,required_room_type').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_locales').select('id,nombre,is_virtual').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_travel_times').select('from_local,to_local,minutes').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_events').select('scope,target_id,jornada_id,day,slot_index').eq('colegio_id', colegioId),
      supabaseAdmin.from('horario_teacher_availability').select('teacher_id,availability').eq('colegio_id', colegioId),
    ]);

  const jornadasOut = (jornadas && Array.isArray(jornadas) && jornadas.length)
    ? jornadas.map((j: any) => ({
      id: String(j.id || '').trim() || 'DEFAULT',
      nombre: j.nombre || '',
      tipo: j.tipo || 'normal',
      nivel: j.nivel || '',
      compare_group: String(j.compare_group || '').trim() || (String(j.id || '').trim() || 'DEFAULT'),
    }))
    : [{ id: 'DEFAULT', nombre: 'Jornada', tipo: 'normal', compare_group: 'DEFAULT' }];

  const travelMap: Record<string, number> = {};
  for (const t of (travel || [])) {
    travelMap[`${t.from_local}->${t.to_local}`] = Number(t.minutes) || 0;
  }

  const availMap = new Map((avail || []).map((r: any) => [String(r.teacher_id), r.availability]));

  const teachersOut = (teachers || []).map((t: any) => ({
    id: String(t.id),
    nombre: t.nombre || '',
    local_base: t.local_base || '',
    locales_permitidos: Array.isArray(t.locales_permitidos) ? t.locales_permitidos : [],
    availability: (availMap.get(String(t.id)) || {}) as Record<string, number[]>,
    max_horas_semana: Number(t.max_horas_semana) || 0,
    preferencias: (t.preferencias || {}) as any,
  }));

  const eventsOut = (events || []).map((e: any) => ({
    scope: (String(e.scope || 'global') as any),
    target_id: e.target_id ? String(e.target_id) : undefined,
    jornada_id: e.jornada_id ? String(e.jornada_id) : undefined,
    day: String(e.day),
    slot: Number(e.slot_index) || 0,
  }));

  return {
    colegio_id: colegioId,
    jornadas: jornadasOut,
    slots: (slots || []).map((s: any) => ({
      jornada_id: String(s.jornada_id || 'DEFAULT'),
      day: String(s.day),
      slot: Number(s.slot_index) || 0,
      is_break: !!s.is_break,
    })).filter((s: any) => s.jornada_id && s.day && s.slot > 0),
    travel_minutes_between_locals: 0,
    max_consecutive_same_course: 2,
    sections: (sections || []).map((s: any) => ({ id: String(s.id), nivel: s.nivel, grado: s.grado, seccion: s.seccion, turno: s.turno, local_base: s.local_base, jornada_id: s.jornada_id ? String(s.jornada_id) : 'DEFAULT' })),
    teachers: teachersOut,
    demands: (demands || []).map((d: any) => ({
      section_id: String(d.section_id),
      course_id: String(d.course_id),
      teacher_id: String(d.teacher_id),
      hours_per_week: Number(d.hours_per_week) || 0,
      required_local_id: d.required_local_id ? String(d.required_local_id) : '',
      required_room_type: d.required_room_type ? String(d.required_room_type) : '',
    })),
    locals: (locales || []).map((l: any) => ({ id: String(l.id), nombre: l.nombre || '', is_virtual: !!l.is_virtual })),
    travel: travelMap,
    events: eventsOut,
  };
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

    const colegioId = String(user.app_metadata?.colegio_id || '');
    const rol = String(user.app_metadata?.rol || '');
    if (!colegioId) return jsonResponse({ error: 'Usuario no asociado a un colegio' }, 400);
    if (!STAFF_ROLES.has(rol)) return jsonResponse({ error: 'No permitido' }, 403);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const attempts = asInt(body.attempts, 25);
    const seed = asInt(body.seed, Date.now());
    const loadFromDb = !!body.loadFromDb;

    let model: InputModel;
    if (loadFromDb) {
      model = await buildModelFromDb(supabaseAdmin, colegioId);
    } else {
      const input = (body.input && typeof body.input === 'object') ? body.input : body;
      const days = normalizeDays((input as any).days) || [];
      model = {
        colegio_id: colegioId,
        days: days.length ? days : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'],
        slots_per_day: Math.max(1, asInt((input as any).slots_per_day, 6)),
        break_slots: Array.isArray((input as any).break_slots) ? (input as any).break_slots.map((x: any) => asInt(x)).filter((x: number) => x > 0) : [],
        travel_minutes_between_locals: Math.max(0, asInt((input as any).travel_minutes_between_locals, 0)),
        max_consecutive_same_course: Math.max(1, asInt((input as any).max_consecutive_same_course, 2)),
        sections: Array.isArray((input as any).sections) ? (input as any).sections : [],
        teachers: Array.isArray((input as any).teachers) ? (input as any).teachers : [],
        demands: Array.isArray((input as any).demands) ? (input as any).demands : [],
        locals: Array.isArray((input as any).locals) ? (input as any).locals : [],
        travel: (input as any).travel && typeof (input as any).travel === 'object' ? (input as any).travel : undefined,
        events: Array.isArray((input as any).events) ? (input as any).events : [],
      };
    }

    if (!model.sections?.length) return jsonResponse({ error: 'Faltan secciones' }, 400);
    if (!model.teachers?.length) return jsonResponse({ error: 'Faltan docentes' }, 400);
    if (!model.demands?.length) return jsonResponse({ error: 'Faltan demandas (cursos por sección)' }, 400);

    const solve = solveTimetable(model, { attempts, seed });

    const { data: runRow, error: runError } = await supabaseAdmin
      .from('horario_runs')
      .insert({
        colegio_id: colegioId,
        user_id: user.id,
        status: solve.ok ? 'ok' : 'failed',
        input: model,
        output: { schedule: solve.schedule, teacher_view: solve.teacher_view, unassigned: solve.unassigned },
        metrics: solve.metrics,
      })
      .select('id')
      .single();

    if (runError || !runRow?.id) return jsonResponse({ error: runError?.message || 'No se pudo guardar el run' }, 500);

    const runId = String(runRow.id);

    const items: any[] = [];
    for (const [section_id, days] of Object.entries(solve.schedule)) {
      for (const [day, slots] of Object.entries(days)) {
        for (const [slotStr, asg] of Object.entries(slots)) {
          const slot_index = Number(slotStr);
          if (!asg) continue;
          items.push({
            run_id: runId,
            colegio_id: colegioId,
            section_id,
            jornada_id: asg.jornada_id || 'DEFAULT',
            day,
            slot_index,
            course_id: asg.course_id,
            teacher_id: asg.teacher_id,
            local_id: asg.local_id || '',
            room_id: '',
          });
        }
      }
    }

    const chunkSize = 500;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const { error: insError } = await supabaseAdmin.from('horario_items').insert(chunk);
      if (insError) return jsonResponse({ error: insError.message, run_id: runId }, 500);
    }

    return jsonResponse({ ok: solve.ok, run_id: runId, output: { schedule: solve.schedule, teacher_view: solve.teacher_view, unassigned: solve.unassigned }, metrics: solve.metrics }, 200);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Error interno' }, 500);
  }
});

