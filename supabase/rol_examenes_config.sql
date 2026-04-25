ALTER TABLE public.colegios
ADD COLUMN IF NOT EXISTS rol_examenes_config JSONB NOT NULL DEFAULT '{}'::jsonb;

