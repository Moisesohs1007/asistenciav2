ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS grado TEXT,
  ADD COLUMN IF NOT EXISTS seccion TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
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

UPDATE public.agenda
SET grado = COALESCE(grado, ''),
    seccion = COALESCE(seccion, '')
WHERE grado IS NULL OR seccion IS NULL;

CREATE INDEX IF NOT EXISTS agenda_colegio_mes_grado_seccion_fecha_idx
ON public.agenda (colegio_id, mes, grado, seccion, fecha);

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
      AND (
        COALESCE(u.es_tutor, FALSE) = TRUE
        OR (COALESCE(u.tutor_grado,'') <> '' AND COALESCE(u.tutor_seccion,'') <> '')
      )
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

CREATE OR REPLACE FUNCTION agenda_creator_is_admin(p_uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = p_uid
      AND COALESCE(u.rol,'') IN ('admin','director','coordinador')
    LIMIT 1
  )
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
      WHEN (u.es_tutor OR (u.tg <> '' AND u.ts <> '')) AND u.tg = COALESCE(p_grado,'') AND u.ts = UPPER(COALESCE(p_seccion,'')) THEN TRUE
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

ALTER TABLE public.agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_read" ON public.agenda;
DROP POLICY IF EXISTS "agenda_write" ON public.agenda;
DROP POLICY IF EXISTS "agenda_read_admin" ON public.agenda;
DROP POLICY IF EXISTS "agenda_read_tutor" ON public.agenda;
DROP POLICY IF EXISTS "agenda_read_apoderado" ON public.agenda;
DROP POLICY IF EXISTS "agenda_insert_admin" ON public.agenda;
DROP POLICY IF EXISTS "agenda_insert_tutor" ON public.agenda;
DROP POLICY IF EXISTS "agenda_update_admin" ON public.agenda;
DROP POLICY IF EXISTS "agenda_update_tutor" ON public.agenda;
DROP POLICY IF EXISTS "agenda_delete_admin" ON public.agenda;
DROP POLICY IF EXISTS "agenda_delete_tutor" ON public.agenda;

CREATE POLICY "agenda_read_admin" ON public.agenda FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_read_tutor" ON public.agenda FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND (created_by = auth.uid() OR created_by IS NULL OR agenda_creator_is_admin(created_by))
    AND (
      (grado = '*' AND seccion = '*')
      OR (seccion = '*' AND grado LIKE 'nivel:%')
      OR (seccion <> '*' AND profesor_puede_aula(grado, seccion))
    )
  );

CREATE POLICY "agenda_read_apoderado" ON public.agenda FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND is_apoderado()
    AND (
      (grado = '*' AND seccion = '*')
      OR (
        seccion = '*'
        AND grado LIKE 'nivel:%'
        AND EXISTS (
          SELECT 1
          FROM public.alumnos a
          WHERE a.colegio_id = agenda.colegio_id
            AND a.id = auth_alumno_id()
            AND a.turno = split_part(agenda.grado, ':', 2)
          LIMIT 1
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.alumnos a
        WHERE a.colegio_id = agenda.colegio_id
          AND a.id = auth_alumno_id()
          AND a.grado = agenda.grado
          AND a.seccion = agenda.seccion
        LIMIT 1
      )
    )
  );

CREATE POLICY "agenda_insert_admin" ON public.agenda FOR INSERT
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_insert_tutor" ON public.agenda FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND seccion <> '*'
    AND grado <> '*'
    AND grado NOT LIKE 'nivel:%'
    AND profesor_puede_aula(grado, seccion)
  );

CREATE POLICY "agenda_update_admin" ON public.agenda FOR UPDATE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord())
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_update_tutor" ON public.agenda FOR UPDATE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND seccion <> '*'
    AND grado <> '*'
    AND grado NOT LIKE 'nivel:%'
    AND profesor_puede_aula(grado, seccion)
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND seccion <> '*'
    AND grado <> '*'
    AND grado NOT LIKE 'nivel:%'
    AND profesor_puede_aula(grado, seccion)
  );

CREATE POLICY "agenda_delete_admin" ON public.agenda FOR DELETE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_delete_tutor" ON public.agenda FOR DELETE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND created_by = auth.uid()
    AND seccion <> '*'
    AND grado <> '*'
    AND grado NOT LIKE 'nivel:%'
    AND profesor_puede_aula(grado, seccion)
  );
