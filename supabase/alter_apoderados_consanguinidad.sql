ALTER TABLE public.apoderados
  ADD COLUMN IF NOT EXISTS consanguinidad TEXT,
  ADD COLUMN IF NOT EXISTS consanguinidad_detalle TEXT,
  ADD COLUMN IF NOT EXISTS consanguinidad2 TEXT,
  ADD COLUMN IF NOT EXISTS consanguinidad_detalle2 TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apoderados_consanguinidad_chk'
  ) THEN
    ALTER TABLE public.apoderados
      ADD CONSTRAINT apoderados_consanguinidad_chk
      CHECK (
        consanguinidad IS NULL OR consanguinidad IN ('padre','madre','tutor_legal','abuelo','tio','otro')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apoderados_consanguinidad2_chk'
  ) THEN
    ALTER TABLE public.apoderados
      ADD CONSTRAINT apoderados_consanguinidad2_chk
      CHECK (
        consanguinidad2 IS NULL OR consanguinidad2 IN ('padre','madre','tutor_legal','abuelo','tio','otro')
      );
  END IF;
END $$;
