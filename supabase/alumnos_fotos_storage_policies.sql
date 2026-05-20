-- Policies para permitir carga masiva de fotos de alumnos en Supabase Storage (bucket alumnos-fotos, PUBLIC)

CREATE OR REPLACE FUNCTION public.user_colegio_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT u.colegio_id
    FROM public.usuarios u
    WHERE u.id = auth.uid()
    LIMIT 1
  ), '')
$$;

GRANT EXECUTE ON FUNCTION public.user_colegio_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_upload_alumnos_fotos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.rol,'') IN ('admin','director','coordinador')
      LIMIT 1
    )
    OR COALESCE((
      SELECT (u.permisos_extra->>'alumnosFotosMasivo')::boolean
      FROM public.usuarios u
      WHERE u.id = auth.uid()
      LIMIT 1
    ), false);
$$;

GRANT EXECUTE ON FUNCTION public.can_upload_alumnos_fotos() TO authenticated;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumnos-fotos insert" ON storage.objects;
DROP POLICY IF EXISTS "alumnos-fotos update" ON storage.objects;
DROP POLICY IF EXISTS "alumnos-fotos delete" ON storage.objects;

CREATE POLICY "alumnos-fotos insert"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'alumnos-fotos'
  AND public.can_upload_alumnos_fotos()
  AND name LIKE (public.user_colegio_id() || '/%')
);

CREATE POLICY "alumnos-fotos update"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'alumnos-fotos'
  AND public.can_upload_alumnos_fotos()
  AND name LIKE (public.user_colegio_id() || '/%')
)
WITH CHECK (
  bucket_id = 'alumnos-fotos'
  AND public.can_upload_alumnos_fotos()
  AND name LIKE (public.user_colegio_id() || '/%')
);

CREATE POLICY "alumnos-fotos delete"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'alumnos-fotos'
  AND public.can_upload_alumnos_fotos()
  AND name LIKE (public.user_colegio_id() || '/%')
);

DROP POLICY IF EXISTS "alumnos-fotos masivo update alumno" ON public.alumnos;

CREATE POLICY "alumnos-fotos masivo update alumno"
ON public.alumnos
FOR UPDATE
USING (
  colegio_id = public.user_colegio_id()
  AND public.can_upload_alumnos_fotos()
)
WITH CHECK (
  colegio_id = public.user_colegio_id()
  AND public.can_upload_alumnos_fotos()
);
