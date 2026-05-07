CREATE OR REPLACE FUNCTION public.list_aulas(p_colegio_id TEXT)
RETURNS TABLE (grado TEXT, seccion TEXT, turno TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    a.grado,
    a.seccion,
    COALESCE(a.turno, '') AS turno
  FROM public.alumnos a
  WHERE a.colegio_id = auth_colegio_id()
    AND a.colegio_id = p_colegio_id
    AND is_staff()
    AND COALESCE(a.grado,'') <> ''
    AND COALESCE(a.seccion,'') <> ''
$$;

GRANT EXECUTE ON FUNCTION public.list_aulas(TEXT) TO anon, authenticated;
