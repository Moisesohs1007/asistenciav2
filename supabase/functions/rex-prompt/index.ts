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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'No autorizado' }, 401);

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Token inválido o expirado' }, 401);

  const colegioId = user.app_metadata?.colegio_id;
  const rol = String(user.app_metadata?.rol || '');
  if (!colegioId) return jsonResponse({ error: 'Usuario no asociado a un colegio' }, 400);
  if (!['admin', 'director', 'profesor'].includes(rol)) return jsonResponse({ error: 'No permitido' }, 403);

  const body = await req.json().catch(() => ({}));
  const promptBase = typeof body.promptBase === 'string' ? body.promptBase : '';
  const colegioNombre = typeof body.colegioNombre === 'string' ? body.colegioNombre : '';
  const colegioEslogan = typeof body.colegioEslogan === 'string' ? body.colegioEslogan : '';
  const payload = body.payload ?? null;

  if (!promptBase || promptBase.length < 20) return jsonResponse({ error: 'PromptBase inválido' }, 400);
  if (promptBase.length > 20000) return jsonResponse({ error: 'PromptBase demasiado largo' }, 400);

  const apiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
  if (!apiKey) return jsonResponse({ error: 'OPENAI_API_KEY no configurado en Supabase Functions' }, 500);

  const model = (Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini').trim();

  let ok = false;
  let resultText = '';
  let errText = '';

  try {
    const system = `Eres un diseñador gráfico institucional escolar. Devuelve SOLO un (1) prompt final en español para un generador de imágenes (sin explicación, sin markdown). No inventes textos ni datos: usa exactamente los textos de la base. No agregues URLs. Mantén composición tipo “Rol de Exámenes”, estética escolar azul/celeste, e indica que el logo será adjunto como insignia arriba a la izquierda y como marca de agua.`;
    const userMsg = `Base:\n${promptBase}\n\nEntrega: Un (1) prompt final listo para un generador de imágenes, manteniendo la estructura y los textos tal cual; si hay “(Sin dato)” o “(Sin exámenes)”, respétalos.`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    const raw = await r.text();
    if (!r.ok) {
      errText = raw || `HTTP ${r.status}`;
      throw new Error('Error OpenAI');
    }

    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (_) {
      parsed = {};
    }
    resultText = String(parsed?.choices?.[0]?.message?.content || '').trim();
    if (!resultText) throw new Error('Respuesta vacía de OpenAI');
    ok = true;
  } catch (e) {
    ok = false;
    errText = errText || String(e?.message || e);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    await supabaseAdmin.from('auditoria_ai').insert({
      colegio_id: colegioId,
      user_id: user.id,
      rol,
      accion: 'rex_prompt',
      ok,
      detalle: ok ? 'ok' : errText.slice(0, 500),
      payload: { colegioNombre, colegioEslogan, promptBaseLen: promptBase.length, payload },
    });
  } catch (_) {
  }

  if (!ok) return jsonResponse({ error: errText || 'Error generando prompt' }, 500);
  return jsonResponse({ success: true, prompt: resultText }, 200);
});
