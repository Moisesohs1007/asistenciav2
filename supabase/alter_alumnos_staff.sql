ALTER TABLE public.alumnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumnos_apoderado_read" ON public.alumnos;
DROP POLICY IF EXISTS "alumnos_staff_read" ON public.alumnos;
DROP POLICY IF EXISTS "alumnos_admin_write" ON public.alumnos;

CREATE POLICY "alumnos_apoderado_read" ON public.alumnos FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND is_apoderado()
    AND id = auth_alumno_id()
  );

CREATE POLICY "alumnos_staff_read" ON public.alumnos FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_staff());

CREATE POLICY "alumnos_admin_write" ON public.alumnos FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin())
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin());
