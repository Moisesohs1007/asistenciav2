CREATE TABLE IF NOT EXISTS public.comunicados (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  alumno_id TEXT NOT NULL,
  grado TEXT NOT NULL DEFAULT '',
  seccion TEXT NOT NULL DEFAULT '',
  turno TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL DEFAULT '',
  detalle TEXT NOT NULL DEFAULT '',
  created_by UUID,
  adjunto_tipo TEXT,
  adjunto_nombre TEXT,
  adjunto_mime TEXT,
  adjunto_bytes INT,
  adjunto_paginas INT,
  preview_mime TEXT,
  preview_bytes INT,
  preview_w INT,
  preview_h INT,
  preview_base64 TEXT
);

CREATE INDEX IF NOT EXISTS comunicados_scope_idx
ON public.comunicados (colegio_id, alumno_id, created_at DESC);

ALTER TABLE public.comunicados
  ADD COLUMN IF NOT EXISTS adjunto_tipo TEXT,
  ADD COLUMN IF NOT EXISTS adjunto_nombre TEXT,
  ADD COLUMN IF NOT EXISTS adjunto_mime TEXT,
  ADD COLUMN IF NOT EXISTS adjunto_bytes INT,
  ADD COLUMN IF NOT EXISTS adjunto_paginas INT,
  ADD COLUMN IF NOT EXISTS preview_mime TEXT,
  ADD COLUMN IF NOT EXISTS preview_bytes INT,
  ADD COLUMN IF NOT EXISTS preview_w INT,
  ADD COLUMN IF NOT EXISTS preview_h INT,
  ADD COLUMN IF NOT EXISTS preview_base64 TEXT;

CREATE OR REPLACE FUNCTION is_admin_or_director_or_coord()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_rol() IN ('admin','director','coordinador')
$$;

CREATE OR REPLACE FUNCTION is_tutor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
      AND COALESCE(u.es_tutor, FALSE) = TRUE
  )
$$;

CREATE OR REPLACE FUNCTION tutor_grado()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT u.tutor_grado
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), '')
$$;

CREATE OR REPLACE FUNCTION tutor_seccion()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT u.tutor_seccion
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), '')
$$;

-- Asignaciones (usuarios.asignaciones): { "3": ["A","B"], "4": [] } (array vacío => todo el grado)
CREATE OR REPLACE FUNCTION profesor_asignaciones()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT u.asignaciones
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION profesor_restringir()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT u.restringir
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), FALSE)
$$;

CREATE OR REPLACE FUNCTION profesor_ver_todas_aulas()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT (u.permisos_extra->>'verTodasAulas')::boolean
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), FALSE)
$$;

CREATE OR REPLACE FUNCTION profesor_puede_aula(p_grado TEXT, p_seccion TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH u AS (
    SELECT
      COALESCE(u.restringir, FALSE) AS restringir,
      COALESCE(u.asignaciones, '{}'::jsonb) AS asig,
      COALESCE(u.permisos_extra, '{}'::jsonb) AS px,
      COALESCE(u.es_tutor, FALSE) AS es_tutor,
      COALESCE(u.tutor_grado, '') AS tg,
      UPPER(COALESCE(u.tutor_seccion, '')) AS ts
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  )
  SELECT
    CASE
      WHEN COALESCE((u.px->>'verTodasAulas')::boolean, FALSE) THEN TRUE
      WHEN NOT u.restringir THEN TRUE
      WHEN u.es_tutor AND u.tg = COALESCE(p_grado,'') AND u.ts = UPPER(COALESCE(p_seccion,'')) THEN TRUE
      WHEN (u.asig ? COALESCE(p_grado,'')) THEN
        CASE
          WHEN jsonb_typeof(u.asig->COALESCE(p_grado,'')) <> 'array' THEN TRUE
          WHEN jsonb_array_length(u.asig->COALESCE(p_grado,'')) = 0 THEN TRUE
          ELSE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(u.asig->COALESCE(p_grado,'')) AS x(seccion)
            WHERE UPPER(x.seccion) = UPPER(COALESCE(p_seccion,''))
            LIMIT 1
          )
        END
      ELSE FALSE
    END
  FROM u
$$;

ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comunicados_read_admin" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_read_tutor" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_read_apoderado" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_insert_admin" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_insert_tutor" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_update_admin" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_update_tutor" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_delete_admin" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_delete_tutor" ON public.comunicados;

CREATE POLICY "comunicados_read_admin" ON public.comunicados FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "comunicados_read_apoderado" ON public.comunicados FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND is_apoderado()
    AND alumno_id = auth_alumno_id()
  );

CREATE POLICY "comunicados_read_tutor" ON public.comunicados FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND profesor_puede_aula(a.grado, a.seccion)
      LIMIT 1
    )
  );

CREATE POLICY "comunicados_insert_admin" ON public.comunicados FOR INSERT
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "comunicados_insert_tutor" ON public.comunicados FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND profesor_puede_aula(a.grado, a.seccion)
      LIMIT 1
    )
  );

CREATE POLICY "comunicados_update_admin" ON public.comunicados FOR UPDATE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord())
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "comunicados_update_tutor" ON public.comunicados FOR UPDATE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND profesor_puede_aula(a.grado, a.seccion)
      LIMIT 1
    )
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND profesor_puede_aula(a.grado, a.seccion)
      LIMIT 1
    )
  );

CREATE POLICY "comunicados_delete_admin" ON public.comunicados FOR DELETE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "comunicados_delete_tutor" ON public.comunicados FOR DELETE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND profesor_puede_aula(a.grado, a.seccion)
      LIMIT 1
    )
  );
