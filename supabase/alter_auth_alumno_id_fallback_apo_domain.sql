DO $$
BEGIN
  CREATE OR REPLACE FUNCTION auth_alumno_id()
  RETURNS TEXT
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
  AS $fn$
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
  $fn$;
END $$;

