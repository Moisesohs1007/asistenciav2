DO $$
DECLARE
  v_colegio_id  TEXT := 'sigece';
  v_start       DATE := DATE '2026-03-01';
  v_end         DATE := CURRENT_DATE;
  v_p_present   DOUBLE PRECISION := 0.92;
  v_p_tardanza  DOUBLE PRECISION := 0.15;
  v_fecha_is_date BOOLEAN := FALSE;
  v_hora_is_time  BOOLEAN := FALSE;
  v_fecha_expr TEXT := '';
  v_hora_expr  TEXT := '';
  v_uP_expr    TEXT := '';
  v_uT_expr    TEXT := '';
  v_uM_expr    TEXT := '';
  v_isT_expr   TEXT := '';
  v_sql TEXT := '';
BEGIN
  SELECT (c.data_type = 'date')
  INTO v_fecha_is_date
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'registros'
    AND c.column_name = 'fecha';
  IF COALESCE(v_fecha_is_date, FALSE) THEN
    v_fecha_expr := 'd::date';
  ELSE
    v_fecha_expr := 'to_char(d::date, ''YYYY-MM-DD'')';
  END IF;

  SELECT (c.data_type LIKE 'time%')
  INTO v_hora_is_time
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'registros'
    AND c.column_name = 'hora';

  v_uP_expr :=
    '(((''x''||substr(md5('
    || quote_literal(v_colegio_id)
    || '||''|''||a.id||''|''||to_char(d::date,''YYYY-MM-DD'')||''|P''),1,16))::bit(64)::bigint & 9223372036854775807)::double precision / 9223372036854775807.0)';
  v_uT_expr :=
    '(((''x''||substr(md5('
    || quote_literal(v_colegio_id)
    || '||''|''||a.id||''|''||to_char(d::date,''YYYY-MM-DD'')||''|T''),1,16))::bit(64)::bigint & 9223372036854775807)::double precision / 9223372036854775807.0)';
  v_uM_expr :=
    '(((''x''||substr(md5('
    || quote_literal(v_colegio_id)
    || '||''|''||a.id||''|''||to_char(d::date,''YYYY-MM-DD'')||''|M''),1,16))::bit(64)::bigint & 9223372036854775807)::double precision / 9223372036854775807.0)';
  v_isT_expr := '(' || v_uT_expr || ' < ' || v_p_tardanza::TEXT || ')';

  IF COALESCE(v_hora_is_time, FALSE) THEN
    v_hora_expr := '(CASE WHEN ' || v_isT_expr || ' THEN ('
      || 'CASE '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%TARDE%'' THEN (time ''13:55'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%NOCHE%'' THEN (time ''18:55'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'ELSE (time ''07:55'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'END'
      || ')::time ELSE ('
      || 'CASE '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%TARDE%'' THEN (time ''13:10'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%NOCHE%'' THEN (time ''18:10'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'ELSE (time ''07:10'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'END'
      || ')::time END)';
  ELSE
    v_hora_expr := 'CASE WHEN ' || v_isT_expr || ' THEN '
      || 'to_char(('
      || 'CASE '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%TARDE%'' THEN (time ''13:55'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%NOCHE%'' THEN (time ''18:55'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'ELSE (time ''07:55'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'END'
      || ')::time, ''HH24:MI'') '
      || 'ELSE '
      || 'to_char(('
      || 'CASE '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%TARDE%'' THEN (time ''13:10'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'WHEN upper(coalesce(a.turno, '''')) LIKE ''%NOCHE%'' THEN (time ''18:10'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'ELSE (time ''07:10'' + (floor((' || v_uM_expr || ')*40)::int) * interval ''1 minute'') '
      || 'END'
      || ')::time, ''HH24:MI'') END';
  END IF;

  EXECUTE format(
    'DELETE FROM public.registros WHERE colegio_id = %L AND (fecha::date) BETWEEN %L AND %L',
    v_colegio_id, v_start, v_end
  );

  EXECUTE format(
    'DELETE FROM public.resumen_mensual WHERE colegio_id = %L AND mes BETWEEN %L AND %L',
    v_colegio_id, to_char(v_start, 'YYYY-MM'), to_char(v_end, 'YYYY-MM')
  );

  v_sql :=
    'INSERT INTO public.registros ' ||
    '(colegio_id, alumno_id, tipo, fecha, hora, estado, nombre, grado, seccion, turno, registrado_por) ' ||
    'SELECT ' ||
      quote_literal(v_colegio_id) || ', ' ||
      'a.id, ' ||
      quote_literal('INGRESO') || ', ' ||
      v_fecha_expr || ', ' ||
      v_hora_expr || ', ' ||
      'CASE WHEN ' || v_isT_expr || ' THEN ''Tardanza'' ELSE ''Puntual'' END, ' ||
      'trim(coalesce(a.apellidos, '''') || '' '' || coalesce(a.nombres, '''')), ' ||
      'coalesce(a.grado, ''''), ' ||
      'coalesce(a.seccion, ''''), ' ||
      'coalesce(a.turno, ''''), ' ||
      quote_literal('seed@system') || ' ' ||
    'FROM public.alumnos a ' ||
    'CROSS JOIN generate_series(' || quote_literal(v_start) || '::date, ' || quote_literal(v_end) || '::date, interval ''1 day'') d ' ||
    'WHERE a.colegio_id = ' || quote_literal(v_colegio_id) || ' ' ||
      'AND extract(isodow from d) BETWEEN 1 AND 5 ' ||
      'AND (' || v_uP_expr || ' < ' || v_p_present::TEXT || ')';

  EXECUTE v_sql;

  INSERT INTO public.resumen_mensual (colegio_id, mes, alumno_id, puntual, tardanza, updated_at)
  SELECT
    r.colegio_id,
    to_char(r.fecha::date, 'YYYY-MM') AS mes,
    r.alumno_id,
    count(*) FILTER (WHERE r.tipo='INGRESO' AND coalesce(r.estado,'') <> 'Tardanza')::int AS puntual,
    count(*) FILTER (WHERE r.tipo='INGRESO' AND coalesce(r.estado,'') =  'Tardanza')::int AS tardanza,
    now() AS updated_at
  FROM public.registros r
  WHERE r.colegio_id = v_colegio_id
    AND (r.fecha::date) BETWEEN v_start AND v_end
  GROUP BY 1,2,3
  ON CONFLICT (colegio_id, mes, alumno_id)
  DO UPDATE SET
    puntual = EXCLUDED.puntual,
    tardanza = EXCLUDED.tardanza,
    updated_at = now();
END $$;
