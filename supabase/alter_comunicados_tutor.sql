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
  created_by UUID
);

CREATE INDEX IF NOT EXISTS comunicados_scope_idx
ON public.comunicados (colegio_id, alumno_id, created_at DESC);

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
    AND is_tutor()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND a.grado = tutor_grado()
        AND a.seccion = tutor_seccion()
      LIMIT 1
    )
  );

CREATE POLICY "comunicados_insert_admin" ON public.comunicados FOR INSERT
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "comunicados_insert_tutor" ON public.comunicados FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND a.grado = tutor_grado()
        AND a.seccion = tutor_seccion()
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
    AND is_tutor()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND a.grado = tutor_grado()
        AND a.seccion = tutor_seccion()
      LIMIT 1
    )
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND a.grado = tutor_grado()
        AND a.seccion = tutor_seccion()
      LIMIT 1
    )
  );

CREATE POLICY "comunicados_delete_admin" ON public.comunicados FOR DELETE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "comunicados_delete_tutor" ON public.comunicados FOR DELETE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.alumnos a
      WHERE a.colegio_id = comunicados.colegio_id
        AND a.id = comunicados.alumno_id
        AND a.grado = tutor_grado()
        AND a.seccion = tutor_seccion()
      LIMIT 1
    )
  );
