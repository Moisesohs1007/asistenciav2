CREATE TABLE IF NOT EXISTS public.alertas_estado (
  colegio_id   TEXT        NOT NULL,
  alumno_id    TEXT        NOT NULL,
  tipo         TEXT        NOT NULL,
  periodo_key  TEXT        NOT NULL,
  nivel_enviado INTEGER    NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (colegio_id, alumno_id, tipo, periodo_key)
);

CREATE TABLE IF NOT EXISTS public.alertas_envios (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  colegio_id       TEXT        NOT NULL,
  alumno_id        TEXT        NOT NULL,
  tutor_uid        UUID,
  tipo             TEXT        NOT NULL,
  periodo_key      TEXT        NOT NULL,
  contador         INTEGER     NOT NULL,
  mensaje          TEXT        NOT NULL,
  telefono_destino TEXT,
  estado           TEXT        NOT NULL DEFAULT 'pendiente',
  error            TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  turno            TEXT,
  grado            TEXT,
  seccion          TEXT,
  alumno_nombre    TEXT,
  tutor_nombre     TEXT
);

CREATE INDEX IF NOT EXISTS idx_alertas_envios_colegio_created_at
  ON public.alertas_envios (colegio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_envios_tutor_created_at
  ON public.alertas_envios (tutor_uid, created_at DESC);

ALTER TABLE public.alertas_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alertas_estado_read_admin" ON public.alertas_estado;
DROP POLICY IF EXISTS "alertas_estado_read_tutor" ON public.alertas_estado;
DROP POLICY IF EXISTS "alertas_envios_read_admin" ON public.alertas_envios;
DROP POLICY IF EXISTS "alertas_envios_read_tutor" ON public.alertas_envios;

CREATE POLICY "alertas_estado_read_admin" ON public.alertas_estado FOR SELECT
  USING (colegio_id = auth_colegio_id() AND auth_rol() IN ('admin','director','coordinador','psicologo'));

CREATE POLICY "alertas_envios_read_admin" ON public.alertas_envios FOR SELECT
  USING (colegio_id = auth_colegio_id() AND auth_rol() IN ('admin','director','coordinador','psicologo'));

CREATE POLICY "alertas_envios_read_tutor" ON public.alertas_envios FOR SELECT
  USING (colegio_id = auth_colegio_id() AND auth_rol() = 'profesor' AND tutor_uid = auth.uid());

CREATE OR REPLACE FUNCTION public.alertas_calc_faltas_mes(p_colegio_id TEXT, p_mes TEXT, p_hoy DATE DEFAULT current_date)
RETURNS TABLE (
  alumno_id      TEXT,
  alumno_nombre  TEXT,
  turno          TEXT,
  grado          TEXT,
  seccion        TEXT,
  faltas         INTEGER,
  tutor_uid      UUID,
  tutor_nombre   TEXT,
  tutor_telefono TEXT,
  periodo_key    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      p_colegio_id AS colegio_id,
      p_mes AS mes,
      (p_mes || '-01')::date AS d1,
      LEAST(p_hoy, (date_trunc('month', (p_mes || '-01')::date) + interval '1 month - 1 day')::date) AS d2
  ),
  dias_habiles AS (
    SELECT
      colegio_id,
      mes,
      COUNT(*)::int AS dias
    FROM params,
      LATERAL generate_series(d1, d2, interval '1 day') AS g(d)
    WHERE EXTRACT(DOW FROM g.d) NOT IN (0,6)
    GROUP BY colegio_id, mes
  ),
  faltas_calc AS (
    SELECT
      a.id AS alumno_id,
      TRIM(COALESCE(a.apellidos,'') || ' ' || COALESCE(a.nombres,'')) AS alumno_nombre,
      COALESCE(a.turno,'') AS turno,
      COALESCE(a.grado,'') AS grado,
      COALESCE(a.seccion,'') AS seccion,
      GREATEST(
        dh.dias - (COALESCE(rm.puntual,0) + COALESCE(rm.tardanza,0)),
        0
      )::int AS faltas
    FROM params p
    JOIN dias_habiles dh ON dh.colegio_id = p.colegio_id AND dh.mes = p.mes
    JOIN public.alumnos a ON a.colegio_id = p.colegio_id
    LEFT JOIN public.resumen_mensual rm
      ON rm.colegio_id = p.colegio_id AND rm.mes = p.mes AND rm.alumno_id = a.id
  ),
  tutores AS (
    SELECT
      u.id AS tutor_uid,
      u.colegio_id,
      COALESCE(u.tutor_grado,'') AS tutor_grado,
      COALESCE(u.tutor_seccion,'') AS tutor_seccion,
      COALESCE(u.nombre,'') AS tutor_nombre,
      COALESCE(u.telefono,'') AS tutor_telefono
    FROM public.usuarios u
    WHERE u.colegio_id = p_colegio_id
      AND u.rol = 'profesor'
      AND u.es_tutor = TRUE
  )
  SELECT
    f.alumno_id,
    f.alumno_nombre,
    f.turno,
    f.grado,
    f.seccion,
    f.faltas,
    t.tutor_uid,
    t.tutor_nombre,
    t.tutor_telefono,
    p_mes AS periodo_key
  FROM faltas_calc f
  JOIN tutores t
    ON t.colegio_id = p_colegio_id
   AND t.tutor_grado = f.grado
   AND t.tutor_seccion = f.seccion
  WHERE f.faltas >= 3
    AND COALESCE(t.tutor_telefono,'') <> '';
$$;

CREATE OR REPLACE FUNCTION public.alertas_calc_tardanzas_semana(p_colegio_id TEXT, p_hoy DATE DEFAULT current_date)
RETURNS TABLE (
  alumno_id      TEXT,
  alumno_nombre  TEXT,
  turno          TEXT,
  grado          TEXT,
  seccion        TEXT,
  tardanzas      INTEGER,
  tutor_uid      UUID,
  tutor_nombre   TEXT,
  tutor_telefono TEXT,
  periodo_key    TEXT,
  desde          DATE,
  hasta          DATE
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      p_colegio_id AS colegio_id,
      date_trunc('week', p_hoy)::date AS d1,
      (date_trunc('week', p_hoy)::date + 4)::date AS d2,
      LEAST(p_hoy, (date_trunc('week', p_hoy)::date + 4)::date) AS d2_eff
  ),
  tard AS (
    SELECT
      r.alumno_id,
      COUNT(*)::int AS tardanzas
    FROM params p
    JOIN public.registros r
      ON r.colegio_id = p.colegio_id
     AND r.tipo = 'INGRESO'
     AND COALESCE(r.estado,'') = 'Tardanza'
     AND r.fecha >= p.d1
     AND r.fecha <= p.d2_eff
    GROUP BY r.alumno_id
  ),
  tutores AS (
    SELECT
      u.id AS tutor_uid,
      u.colegio_id,
      COALESCE(u.tutor_grado,'') AS tutor_grado,
      COALESCE(u.tutor_seccion,'') AS tutor_seccion,
      COALESCE(u.nombre,'') AS tutor_nombre,
      COALESCE(u.telefono,'') AS tutor_telefono
    FROM public.usuarios u
    WHERE u.colegio_id = p_colegio_id
      AND u.rol = 'profesor'
      AND u.es_tutor = TRUE
  )
  SELECT
    a.id AS alumno_id,
    TRIM(COALESCE(a.apellidos,'') || ' ' || COALESCE(a.nombres,'')) AS alumno_nombre,
    COALESCE(a.turno,'') AS turno,
    COALESCE(a.grado,'') AS grado,
    COALESCE(a.seccion,'') AS seccion,
    t.tardanzas,
    u.tutor_uid,
    u.tutor_nombre,
    u.tutor_telefono,
    (p.d1::text || '..' || p.d2::text) AS periodo_key,
    p.d1 AS desde,
    p.d2 AS hasta
  FROM params p
  JOIN tard t ON true
  JOIN public.alumnos a ON a.colegio_id = p.colegio_id AND a.id = t.alumno_id
  JOIN tutores u
    ON u.colegio_id = p.colegio_id
   AND u.tutor_grado = COALESCE(a.grado,'')
   AND u.tutor_seccion = COALESCE(a.seccion,'')
  WHERE t.tardanzas >= 3
    AND COALESCE(u.tutor_telefono,'') <> '';
$$;

GRANT EXECUTE ON FUNCTION public.alertas_calc_faltas_mes(TEXT,TEXT,DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertas_calc_tardanzas_semana(TEXT,DATE) TO anon, authenticated;
