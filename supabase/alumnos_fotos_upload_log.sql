CREATE TABLE IF NOT EXISTS public.alumnos_fotos_upload_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  colegio_id TEXT NOT NULL,
  actor_uid UUID,
  actor_email TEXT,
  actor_rol TEXT,
  dni TEXT,
  path TEXT,
  bytes INT,
  mime TEXT,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  source TEXT NOT NULL DEFAULT 'edge'
);

CREATE INDEX IF NOT EXISTS alumnos_fotos_upload_log_colegio_created_idx
ON public.alumnos_fotos_upload_log (colegio_id, created_at DESC);

ALTER TABLE public.alumnos_fotos_upload_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumnos_fotos_upload_log_read" ON public.alumnos_fotos_upload_log;
CREATE POLICY "alumnos_fotos_upload_log_read"
ON public.alumnos_fotos_upload_log
FOR SELECT
USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "alumnos_fotos_upload_log_insert" ON public.alumnos_fotos_upload_log;
CREATE POLICY "alumnos_fotos_upload_log_insert"
ON public.alumnos_fotos_upload_log
FOR INSERT
WITH CHECK (FALSE);

