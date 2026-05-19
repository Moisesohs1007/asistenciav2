import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function limaIsoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

function monthKey(isoDate: string) {
  return isoDate.slice(0, 7);
}

function normalizePhone(telefono: string) {
  let digits = String(telefono || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 9) digits = '51' + digits;
  if (!digits || digits.length < 11) return '';
  return digits;
}

async function sendFactilizaText(params: {
  token: string;
  instancia: string;
  telefono: string;
  mensaje: string;
}) {
  const { token, instancia, telefono, mensaje } = params;
  const instanciaSafe = encodeURIComponent(String(instancia || '').trim());
  const factilizaBase = 'https://apiwsp.factiliza.com';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  const num = normalizePhone(telefono);
  if (!num) throw new Error('Número inválido');

  const resNew = await fetch(`${factilizaBase}/api/v1/message/sendText/${instanciaSafe}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number: num, text: mensaje, numero: num, texto: mensaje }),
  });
  if (resNew.status !== 404) {
    const txt = await resNew.text();
    if (!resNew.ok) throw new Error(`Factiliza ${resNew.status}: ${txt}`);
    return;
  }
  const resOld = await fetch(`${factilizaBase}/v1/message/sendtext/${instanciaSafe}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number: num, text: mensaje }),
  });
  const txt2 = await resOld.text();
  if (!resOld.ok) throw new Error(`Factiliza ${resOld.status}: ${txt2}`);
}

async function getEstadoMap(sb: any, colegioId: string, tipo: string, periodoKey: string, alumnoIds: string[]) {
  const map = new Map<string, number>();
  const ids = [...new Set(alumnoIds.map(String).filter(Boolean))];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from('alertas_estado')
      .select('alumno_id, nivel_enviado')
      .eq('colegio_id', colegioId)
      .eq('tipo', tipo)
      .eq('periodo_key', periodoKey)
      .in('alumno_id', chunk);
    if (error) throw new Error(error.message);
    (data || []).forEach((r: any) => map.set(r.alumno_id, r.nivel_enviado || 0));
  }
  return map;
}

async function upsertEstado(sb: any, row: { colegio_id: string; alumno_id: string; tipo: string; periodo_key: string; nivel_enviado: number; }) {
  const { error } = await sb
    .from('alertas_estado')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'colegio_id,alumno_id,tipo,periodo_key' });
  if (error) throw new Error(error.message);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  const expected = Deno.env.get('CRON_KEY') ?? '';
  const got = req.headers.get('x-cron-key') ?? '';
  if (!expected || got !== expected) return json(401, { error: 'No autorizado' });

  const body = await req.json().catch(() => ({}));
  const colegioIdOnly = typeof body.colegioId === 'string' ? body.colegioId.trim() : '';
  const dryRun = !!body.dryRun;

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const hoy = limaIsoDate();
  const mes = monthKey(hoy);

  const colegios: Array<{ id: string }> = [];
  if (colegioIdOnly) {
    colegios.push({ id: colegioIdOnly });
  } else {
    const { data, error } = await sb.from('colegios').select('id');
    if (error) return json(500, { error: error.message });
    (data || []).forEach((r: any) => colegios.push({ id: r.id }));
  }

  let enviados = 0;
  const errores: Array<Record<string, unknown>> = [];

  for (const c of colegios) {
    const { data: colegio, error: eColegio } = await sb
      .from('colegios')
      .select('id, factiliza_token, factiliza_instancia')
      .eq('id', c.id)
      .single();

    if (eColegio || !colegio?.factiliza_token || !colegio?.factiliza_instancia) {
      errores.push({ colegioId: c.id, error: 'Config WhatsApp no disponible' });
      continue;
    }

    const token = String(colegio.factiliza_token || '');
    const instancia = String(colegio.factiliza_instancia || '');

    try {
      const { data: faltasRows, error: eFaltas } = await sb.rpc('alertas_calc_faltas_mes', {
        p_colegio_id: c.id,
        p_mes: mes,
        p_hoy: hoy,
      });
      if (eFaltas) throw new Error(eFaltas.message);

      const faltas = (faltasRows || []) as any[];
      const faltasIds = faltas.map(r => String(r.alumno_id || '')).filter(Boolean);
      const estadoF = await getEstadoMap(sb, c.id, 'FALTAS_MES', mes, faltasIds);

      for (const r of faltas) {
        const alumnoId = String(r.alumno_id || '');
        const tutorUid = String(r.tutor_uid || '');
        const tel = String(r.tutor_telefono || '');
        const falt = Number(r.faltas || 0);
        if (!alumnoId || !tutorUid || !tel || falt < 3) continue;

        const nivel = Math.floor(falt / 3);
        const last = estadoF.get(alumnoId) || 0;
        if (nivel <= last) continue;

        const msg = `Aviso: ${r.alumno_nombre || 'Alumno'} acumula ${falt} faltas en ${mes}. Aula: ${r.grado || ''} ${r.seccion || ''}.`;
        const { data: ins, error: eIns } = await sb
          .from('alertas_envios')
          .insert({
            colegio_id: c.id,
            alumno_id: alumnoId,
            tutor_uid: tutorUid,
            tipo: 'FALTAS_MES',
            periodo_key: mes,
            contador: falt,
            mensaje: msg,
            telefono_destino: tel,
            turno: r.turno || '',
            grado: r.grado || '',
            seccion: r.seccion || '',
            alumno_nombre: r.alumno_nombre || '',
            tutor_nombre: r.tutor_nombre || '',
            estado: 'pendiente',
          })
          .select('id')
          .single();
        if (eIns) throw new Error(eIns.message);

        try {
          if (!dryRun) {
            await sendFactilizaText({ token, instancia, telefono: tel, mensaje: msg });
          }
          await sb.from('alertas_envios').update({ estado: dryRun ? 'simulado' : 'enviado', sent_at: new Date().toISOString() }).eq('id', ins.id);
          await upsertEstado(sb, { colegio_id: c.id, alumno_id: alumnoId, tipo: 'FALTAS_MES', periodo_key: mes, nivel_enviado: nivel });
          enviados++;
        } catch (e) {
          await sb.from('alertas_envios').update({ estado: 'fallo', error: String(e?.message || e) }).eq('id', ins.id);
        }
      }
    } catch (e) {
      errores.push({ colegioId: c.id, tipo: 'FALTAS_MES', error: String(e?.message || e) });
    }

    try {
      const { data: tardRows, error: eTard } = await sb.rpc('alertas_calc_tardanzas_semana', {
        p_colegio_id: c.id,
        p_hoy: hoy,
      });
      if (eTard) throw new Error(eTard.message);

      const tard = (tardRows || []) as any[];
      if (!tard.length) continue;

      const periodoKey = String(tard[0]?.periodo_key || '');
      const tardIds = tard.map(r => String(r.alumno_id || '')).filter(Boolean);
      const estadoT = await getEstadoMap(sb, c.id, 'TARDANZAS_5D', periodoKey, tardIds);

      for (const r of tard) {
        const alumnoId = String(r.alumno_id || '');
        const tutorUid = String(r.tutor_uid || '');
        const tel = String(r.tutor_telefono || '');
        const tcount = Number(r.tardanzas || 0);
        if (!alumnoId || !tutorUid || !tel || tcount < 3) continue;

        const last = estadoT.get(alumnoId) || 0;
        if (last >= 1) continue;

        const msg = `Aviso: ${r.alumno_nombre || 'Alumno'} acumula ${tcount} tardanzas esta semana (Lun–Vie). Aula: ${r.grado || ''} ${r.seccion || ''}.`;
        const { data: ins, error: eIns } = await sb
          .from('alertas_envios')
          .insert({
            colegio_id: c.id,
            alumno_id: alumnoId,
            tutor_uid: tutorUid,
            tipo: 'TARDANZAS_5D',
            periodo_key: periodoKey,
            contador: tcount,
            mensaje: msg,
            telefono_destino: tel,
            turno: r.turno || '',
            grado: r.grado || '',
            seccion: r.seccion || '',
            alumno_nombre: r.alumno_nombre || '',
            tutor_nombre: r.tutor_nombre || '',
            estado: 'pendiente',
          })
          .select('id')
          .single();
        if (eIns) throw new Error(eIns.message);

        try {
          if (!dryRun) {
            await sendFactilizaText({ token, instancia, telefono: tel, mensaje: msg });
          }
          await sb.from('alertas_envios').update({ estado: dryRun ? 'simulado' : 'enviado', sent_at: new Date().toISOString() }).eq('id', ins.id);
          await upsertEstado(sb, { colegio_id: c.id, alumno_id: alumnoId, tipo: 'TARDANZAS_5D', periodo_key: periodoKey, nivel_enviado: 1 });
          enviados++;
        } catch (e) {
          await sb.from('alertas_envios').update({ estado: 'fallo', error: String(e?.message || e) }).eq('id', ins.id);
        }
      }
    } catch (e) {
      errores.push({ colegioId: c.id, tipo: 'TARDANZAS_5D', error: String(e?.message || e) });
    }
  }

  return json(200, { ok: true, hoy, mes, enviados, dryRun, errores });
});
