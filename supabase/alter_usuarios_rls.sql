ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_read_staff" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_admin_director" ON public.usuarios;

CREATE POLICY "usuarios_read_staff" ON public.usuarios FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_staff());

CREATE POLICY "usuarios_update_admin_director" ON public.usuarios FOR UPDATE
  USING (colegio_id = auth_colegio_id() AND auth_rol() IN ('admin','director'))
  WITH CHECK (colegio_id = auth_colegio_id() AND auth_rol() IN ('admin','director'));

