DO $$
DECLARE
  v_colegio_id TEXT := 'sigece';
  v_tutor RECORD;
  v_alumno RECORD;
  v_hoy DATE := CURRENT_DATE;
  v_lun DATE;
  v_mar DATE;
  v_mie DATE;
  v_mes TEXT;
  v_semana_key TEXT;
  v_dias_habiles INT;
BEGIN
  SELECT id, nombre, telefono, tutor_grado, tutor_seccion
  INTO v_tutor
  FROM public.usuarios
  WHERE colegio_id = v_colegio_id
    AND rol = 'profesor'
    AND es_tutor = TRUE
    AND COALESCE(telefono,'') <> ''
    AND COALESCE(tutor_grado,'') <> ''
    AND COALESCE(tutor_seccion,'') <> ''
  ORDER BY nombre
  LIMIT 1;

  IF v_tutor.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró tutor con teléfono en usuarios para colegio_id=%', v_colegio_id;
  END IF;

  SELECT id, nombres, apellidos, grado, seccion, turno
  INTO v_alumno
  FROM public.alumnos
  WHERE colegio_id = v_colegio_id
    AND grado = v_tutor.tutor_grado
    AND seccion = v_tutor.tutor_seccion
  ORDER BY id
  LIMIT 1;

  IF v_alumno.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró alumno para el aula del tutor (% %)', v_tutor.tutor_grado, v_tutor.tutor_seccion;
  END IF;

  v_lun := date_trunc('week', v_hoy)::date;
  v_mar := v_lun + 1;
  v_mie := v_lun + 2;
  v_mes := to_char(v_hoy, 'YYYY-MM');
  v_semana_key := (v_lun::text || '..' || (v_lun + 4)::text);

  -- limpiar estado/envíos previos para que la prueba siempre dispare
  DELETE FROM public.alertas_estado
   WHERE colegio_id = v_colegio_id
     AND alumno_id = v_alumno.id
     AND (
       (tipo = 'FALTAS_MES' AND periodo_key = v_mes) OR
       (tipo = 'TARDANZAS_5D' AND periodo_key = v_semana_key)
     );

  DELETE FROM public.alertas_envios
   WHERE colegio_id = v_colegio_id
     AND alumno_id = v_alumno.id
     AND (
       (tipo = 'FALTAS_MES' AND periodo_key = v_mes) OR
       (tipo = 'TARDANZAS_5D' AND periodo_key = v_semana_key)
     );

  -- si ya existen registros (puntual, etc.) en esos días, borrarlos para asegurar 3 tardanzas
  DELETE FROM public.registros
   WHERE colegio_id = v_colegio_id
     AND alumno_id = v_alumno.id
     AND tipo = 'INGRESO'
     AND fecha IN (v_lun, v_mar, v_mie);

  -- 3 tardanzas en la semana actual (lun-mar-mie)
  INSERT INTO public.registros (colegio_id, alumno_id, tipo, fecha, hora, estado, nombre, grado, seccion, turno, registrado_por)
  VALUES
    (v_colegio_id, v_alumno.id, 'INGRESO', v_lun, '08:20', 'Tardanza', trim(coalesce(v_alumno.apellidos,'')||' '||coalesce(v_alumno.nombres,'')), v_alumno.grado, v_alumno.seccion, v_alumno.turno, 'seed_test'),
    (v_colegio_id, v_alumno.id, 'INGRESO', v_mar, '08:25', 'Tardanza', trim(coalesce(v_alumno.apellidos,'')||' '||coalesce(v_alumno.nombres,'')), v_alumno.grado, v_alumno.seccion, v_alumno.turno, 'seed_test'),
    (v_colegio_id, v_alumno.id, 'INGRESO', v_mie, '08:30', 'Tardanza', trim(coalesce(v_alumno.apellidos,'')||' '||coalesce(v_alumno.nombres,'')), v_alumno.grado, v_alumno.seccion, v_alumno.turno, 'seed_test')
  ;

  -- Faltas del mes: ajustar resumen para que "faltas" salga exactamente 3 según la misma lógica del RPC
  SELECT COUNT(*)::int
    INTO v_dias_habiles
  FROM generate_series((v_mes || '-01')::date, LEAST(v_hoy, (date_trunc('month', (v_mes || '-01')::date) + interval '1 month - 1 day')::date), interval '1 day') AS g(d)
  WHERE EXTRACT(DOW FROM g.d) NOT IN (0,6);

  INSERT INTO public.resumen_mensual (colegio_id, mes, alumno_id, puntual, tardanza, updated_at)
  VALUES (v_colegio_id, v_mes, v_alumno.id, GREATEST(v_dias_habiles - 3, 0), 0, now())
  ON CONFLICT (colegio_id, mes, alumno_id)
  DO UPDATE SET puntual=GREATEST(v_dias_habiles - 3, 0), tardanza=0, updated_at=now();

  RAISE NOTICE 'OK seed alertas. Tutor=% (% %), Alumno=% (% % %), SemanaKey=% Mes=% DiasHabiles=%',
    v_tutor.nombre, v_tutor.tutor_grado, v_tutor.tutor_seccion,
    v_alumno.id, v_alumno.grado, v_alumno.seccion, v_alumno.turno,
    v_semana_key, v_mes, v_dias_habiles;
END $$;
