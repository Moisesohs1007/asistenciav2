-- ============================================================
-- ASISTENCIA QR v2 — Esquema Supabase Refactorizado (Multi-tenant seguro)
-- ============================================================

-- 1. Asegurar funciones helpers
CREATE OR REPLACE FUNCTION auth_colegio_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'colegio_id', '')
$$;

CREATE OR REPLACE FUNCTION auth_rol()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'rol', '')
$$;

CREATE OR REPLACE FUNCTION auth_alumno_id()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id TEXT;
  v_rol       TEXT;
  v_email     TEXT;
BEGIN
  v_alumno_id := COALESCE(auth.jwt() -> 'app_metadata' ->> 'alumno_id', '');
  IF v_alumno_id <> '' THEN
    RETURN v_alumno_id;
  END IF;

  v_rol := COALESCE(auth.jwt() -> 'app_metadata' ->> 'rol', '');
  IF v_rol <> 'apoderado' THEN
    RETURN '';
  END IF;

  v_email := COALESCE(auth.jwt() ->> 'email', '');
  IF v_email LIKE '%@apo.marello.pe' THEN
    RETURN split_part(v_email, '@', 1);
  END IF;

  RETURN '';
END;
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_rol() IN ('admin','director','coordinador','profesor','psicologo','auxiliar','portero')
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_rol() = 'admin'
$$;

CREATE OR REPLACE FUNCTION is_apoderado()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_rol() = 'apoderado'
$$;

-- 2. POLÍTICA ESTRICTA EN TABLA COLEGIOS
-- Evita que los apoderados puedan leer factiliza_token y factiliza_instancia
-- Creamos una vista segura o simplemente limitamos qué columnas pueden ver, pero en RLS 
-- a nivel de tabla lo más limpio es bloquear la lectura de esa tabla a apoderados y exponer 
-- un endpoint o vista si necesitan ver el logo. En este caso, el logo y config pública
-- lo ven vía config general (sin tokens).

ALTER TABLE colegios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colegios_read" ON colegios;

-- Staff y Admin leen todo. 
-- Apoderados no leen directamente colegios. Usan endpoints.
CREATE POLICY "colegios_read" ON colegios FOR SELECT
  USING (id = auth_colegio_id() AND is_staff());

CREATE POLICY "colegios_write" ON colegios FOR ALL
  USING (id = auth_colegio_id() AND is_admin());

CREATE OR REPLACE FUNCTION get_colegio_public(p_colegio_id TEXT)
RETURNS TABLE (
  id TEXT,
  nombre TEXT,
  anio TEXT,
  eslogan TEXT,
  logo_url TEXT,
  apo_domain TEXT,
  niveles JSONB,
  grados JSONB,
  secciones JSONB,
  banner_imagenes JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.nombre,
    c.anio,
    c.eslogan,
    c.logo_url,
    c.apo_domain,
    c.niveles,
    c.grados,
    c.secciones,
    c.banner_imagenes
  FROM colegios c
  WHERE c.id = p_colegio_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION get_colegio_public(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION set_whatsapp_config(p_colegio_id TEXT, p_token TEXT, p_instancia TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'rol', '') <> 'admin' THEN
    RAISE EXCEPTION 'No permitido';
  END IF;
  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'colegio_id', '') <> p_colegio_id THEN
    RAISE EXCEPTION 'No permitido';
  END IF;
  UPDATE colegios
  SET factiliza_token = p_token,
      factiliza_instancia = p_instancia
  WHERE id = p_colegio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_whatsapp_config(TEXT, TEXT, TEXT) TO authenticated;

-- 3. POLÍTICA ESTRICTA EN TABLA REGISTROS
-- Apoderados solo pueden ver sus propios registros (donde alumno_id coincide con su metadata)
-- Nunca pueden listar todos los registros
ALTER TABLE registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "registros_apoderado_read" ON registros;

CREATE POLICY "registros_apoderado_read" ON registros FOR SELECT
  USING (
    colegio_id = auth_colegio_id() AND 
    is_apoderado() AND 
    alumno_id = auth_alumno_id()
  );

-- 4. POLÍTICA ESTRICTA EN TABLA ALUMNOS
ALTER TABLE alumnos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alumnos_apoderado_read" ON alumnos;

CREATE POLICY "alumnos_apoderado_read" ON alumnos FOR SELECT
  USING (
    colegio_id = auth_colegio_id() AND 
    is_apoderado() AND 
    id = auth_alumno_id()
  );

-- 5. POLÍTICA ESTRICTA EN RESUMEN MENSUAL
ALTER TABLE resumen_mensual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resumen_apoderado_read" ON resumen_mensual;

CREATE POLICY "resumen_apoderado_read" ON resumen_mensual FOR SELECT
  USING (
    colegio_id = auth_colegio_id() AND 
    is_apoderado() AND 
    alumno_id = auth_alumno_id()
  );

-- 6. AGENDA ESCOLAR (EVENTOS)
-- Lectura: admin/director/coordinador, tutores (solo su tutoría) y apoderados (solo del aula del alumno)
-- Escritura: admin/director/coordinador (cualquier aula) y tutor (solo su tutoría)
CREATE TABLE IF NOT EXISTS agenda (
  id TEXT PRIMARY KEY,
  colegio_id TEXT NOT NULL REFERENCES colegios(id) ON DELETE CASCADE,
  grado TEXT NOT NULL DEFAULT '',
  seccion TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL,          -- YYYY-MM-DD
  mes TEXT NOT NULL,            -- YYYY-MM
  hora TEXT DEFAULT '',         -- HH:MM (opcional)
  titulo TEXT NOT NULL,
  detalle TEXT DEFAULT '',
  created_by UUID,
  created_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agenda_colegio_mes_idx ON agenda (colegio_id, mes);
CREATE INDEX IF NOT EXISTS agenda_colegio_fecha_idx ON agenda (colegio_id, fecha);
CREATE INDEX IF NOT EXISTS agenda_colegio_mes_grado_seccion_fecha_idx ON agenda (colegio_id, mes, grado, seccion, fecha);

ALTER TABLE agenda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agenda_read" ON agenda;
DROP POLICY IF EXISTS "agenda_write" ON agenda;

CREATE OR REPLACE FUNCTION is_admin_or_director_or_coord()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_rol() IN ('admin','director','coordinador')
$$;

CREATE OR REPLACE FUNCTION is_tutor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
      AND COALESCE(u.es_tutor, FALSE) = TRUE
  )
$$;

CREATE OR REPLACE FUNCTION tutor_grado()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT u.tutor_grado
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), '')
$$;

CREATE OR REPLACE FUNCTION tutor_seccion()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT u.tutor_seccion
    FROM public.usuarios u
    WHERE u.colegio_id = auth_colegio_id()
      AND u.id = auth.uid()
    LIMIT 1
  ), '')
$$;

CREATE POLICY "agenda_read_admin" ON agenda FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_read_tutor" ON agenda FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND (
      (grado = tutor_grado() AND seccion = tutor_seccion())
      OR (grado = '*' AND seccion = '*')
    )
  );

CREATE POLICY "agenda_read_apoderado" ON agenda FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND is_apoderado()
    AND (
      (grado = '*' AND seccion = '*')
      OR EXISTS (
        SELECT 1
        FROM public.alumnos a
        WHERE a.colegio_id = agenda.colegio_id
          AND a.id = auth_alumno_id()
          AND a.grado = agenda.grado
          AND a.seccion = agenda.seccion
        LIMIT 1
      )
    )
  );

CREATE POLICY "agenda_insert_admin" ON agenda FOR INSERT
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_insert_tutor" ON agenda FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
    AND created_by = auth.uid()
  );

CREATE POLICY "agenda_update_admin" ON agenda FOR UPDATE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord())
  WITH CHECK (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_update_tutor" ON agenda FOR UPDATE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  );

CREATE POLICY "agenda_delete_admin" ON agenda FOR DELETE
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director_or_coord());

CREATE POLICY "agenda_delete_tutor" ON agenda FOR DELETE
  USING (
    colegio_id = auth_colegio_id()
    AND auth_rol() = 'profesor'
    AND is_tutor()
    AND created_by = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  );

-- 7. AUDITORÍA IA (PROMPTS AUTOMÁTICOS)
-- Inserción: solo service role (desde Edge Functions)
-- Lectura: staff del mismo colegio
CREATE TABLE IF NOT EXISTS auditoria_ai (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES colegios(id) ON DELETE CASCADE,
  user_id UUID,
  rol TEXT DEFAULT '',
  accion TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  detalle TEXT DEFAULT '',
  payload JSONB
);

CREATE INDEX IF NOT EXISTS auditoria_ai_colegio_idx ON auditoria_ai (colegio_id, created_at DESC);

ALTER TABLE auditoria_ai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auditoria_ai_read" ON auditoria_ai;
DROP POLICY IF EXISTS "auditoria_ai_insert" ON auditoria_ai;

CREATE POLICY "auditoria_ai_read" ON auditoria_ai FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_staff());

CREATE POLICY "auditoria_ai_insert" ON auditoria_ai FOR INSERT
  WITH CHECK (FALSE);
