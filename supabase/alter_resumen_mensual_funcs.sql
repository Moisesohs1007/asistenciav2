CREATE UNIQUE INDEX IF NOT EXISTS resumen_mensual_unique
ON public.resumen_mensual (colegio_id, mes, alumno_id);

CREATE OR REPLACE FUNCTION public.upsert_resumen_mensual(
  p_colegio_id  TEXT,
  p_mes         TEXT,
  p_alumno_id   TEXT,
  p_es_tardanza BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_colegio_id() <> p_colegio_id OR NOT is_staff() THEN
    RAISE EXCEPTION 'No permitido';
  END IF;

  INSERT INTO public.resumen_mensual (colegio_id, mes, alumno_id, puntual, tardanza, updated_at)
  VALUES (p_colegio_id, p_mes, p_alumno_id,
          CASE WHEN p_es_tardanza THEN 0 ELSE 1 END,
          CASE WHEN p_es_tardanza THEN 1 ELSE 0 END,
          NOW())
  ON CONFLICT (colegio_id, mes, alumno_id)
  DO UPDATE SET
    puntual  = public.resumen_mensual.puntual  + CASE WHEN EXCLUDED.tardanza = 1 THEN 0 ELSE 1 END,
    tardanza = public.resumen_mensual.tardanza + CASE WHEN EXCLUDED.tardanza = 1 THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_resumen_mensual(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_resumen_mes(
  p_colegio_id TEXT,
  p_mes        TEXT,
  p_alumno_id  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_puntual  INTEGER := 0;
  v_tardanza INTEGER := 0;
BEGIN
  IF auth_colegio_id() <> p_colegio_id OR NOT is_staff() THEN
    RAISE EXCEPTION 'No permitido';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE tipo='INGRESO' AND COALESCE(estado,'') <> 'Tardanza')::INT,
    COUNT(*) FILTER (WHERE tipo='INGRESO' AND COALESCE(estado,'') =  'Tardanza')::INT
  INTO v_puntual, v_tardanza
  FROM public.registros
  WHERE colegio_id = p_colegio_id
    AND alumno_id  = p_alumno_id
    AND fecha LIKE (p_mes || '%');

  INSERT INTO public.resumen_mensual (colegio_id, mes, alumno_id, puntual, tardanza, updated_at)
  VALUES (p_colegio_id, p_mes, p_alumno_id, v_puntual, v_tardanza, NOW())
  ON CONFLICT (colegio_id, mes, alumno_id)
  DO UPDATE SET
    puntual = EXCLUDED.puntual,
    tardanza = EXCLUDED.tardanza,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_resumen_mes(TEXT, TEXT, TEXT) TO authenticated;

