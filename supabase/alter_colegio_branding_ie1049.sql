DO $$
DECLARE
  has_updated_at BOOLEAN;
BEGIN
  IF to_regclass('public.colegios') IS NULL THEN
    RAISE NOTICE 'Tabla public.colegios no existe; no se aplicó branding.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'colegios'
      AND column_name = 'updated_at'
  ) INTO has_updated_at;

  IF has_updated_at THEN
    UPDATE public.colegios
    SET nombre = 'I.E. Nº 1049 Juana Alarco De Dammert',
        eslogan = '',
        updated_at = NOW()
    WHERE id = 'sigece';
  ELSE
    UPDATE public.colegios
    SET nombre = 'I.E. Nº 1049 Juana Alarco De Dammert',
        eslogan = ''
    WHERE id = 'sigece';
  END IF;
END $$;

