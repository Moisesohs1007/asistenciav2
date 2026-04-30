-- Agrega un JSONB extensible para permisos especiales por usuario
-- (permite habilitar opciones del sistema sin crear muchas columnas boolean)

ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS permisos_extra JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Compatibilidad: si existe la columna legacy incidentes_dia_lectura, migrarla al JSONB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'usuarios'
      AND column_name  = 'incidentes_dia_lectura'
  ) THEN
    UPDATE public.usuarios
    SET permisos_extra = jsonb_set(
      permisos_extra,
      '{incidentesDiaLectura}',
      to_jsonb(incidentes_dia_lectura),
      true
    )
    WHERE permisos_extra ? 'incidentesDiaLectura' = FALSE;
  END IF;
END $$;

