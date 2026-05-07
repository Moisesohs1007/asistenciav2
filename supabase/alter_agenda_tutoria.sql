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
    AND is_tutor()
    AND (
      (grado = tutor_grado() AND seccion = tutor_seccion())
      OR (grado = '*' AND seccion = '*')
      OR (seccion = '*' AND grado LIKE 'nivel:%')
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
    AND is_tutor()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
    AND created_by = auth.uid()
  );

CREATE POLICY "agenda_update_admin" ON public.agenda FOR UPDATE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord())
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_update_tutor" ON public.agenda FOR UPDATE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  );

CREATE POLICY "agenda_delete_admin" ON public.agenda FOR DELETE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_delete_tutor" ON public.agenda FOR DELETE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  );
