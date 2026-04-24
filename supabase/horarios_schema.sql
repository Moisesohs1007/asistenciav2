CREATE TABLE IF NOT EXISTS public.horario_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL,
  output JSONB,
  metrics JSONB
);

CREATE INDEX IF NOT EXISTS horario_runs_colegio_created_idx
ON public.horario_runs (colegio_id, created_at DESC);

ALTER TABLE public.horario_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "horario_runs_read" ON public.horario_runs;
DROP POLICY IF EXISTS "horario_runs_write" ON public.horario_runs;

CREATE POLICY "horario_runs_read" ON public.horario_runs FOR SELECT
  USING (colegio_id = auth_colegio_id() AND is_staff());

CREATE POLICY "horario_runs_write" ON public.horario_runs FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_staff());

CREATE TABLE IF NOT EXISTS public.horario_locales (
  id TEXT NOT NULL,
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  direccion TEXT DEFAULT '',
  PRIMARY KEY (colegio_id, id)
);

CREATE TABLE IF NOT EXISTS public.horario_travel_times (
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  from_local TEXT NOT NULL,
  to_local TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (colegio_id, from_local, to_local),
  FOREIGN KEY (colegio_id, from_local) REFERENCES public.horario_locales(colegio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (colegio_id, to_local) REFERENCES public.horario_locales(colegio_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.horario_rooms (
  id TEXT NOT NULL,
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT '',
  capacidad INTEGER DEFAULT 0,
  PRIMARY KEY (colegio_id, id),
  FOREIGN KEY (colegio_id, local_id) REFERENCES public.horario_locales(colegio_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.horario_courses (
  id TEXT NOT NULL,
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT '',
  PRIMARY KEY (colegio_id, id)
);

CREATE TABLE IF NOT EXISTS public.horario_sections (
  id TEXT NOT NULL,
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL,
  grado TEXT NOT NULL,
  seccion TEXT NOT NULL,
  turno TEXT DEFAULT '',
  local_base TEXT DEFAULT '',
  capacidad INTEGER DEFAULT 0,
  PRIMARY KEY (colegio_id, id)
);

CREATE TABLE IF NOT EXISTS public.horario_teachers (
  id TEXT NOT NULL,
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT DEFAULT '',
  local_base TEXT DEFAULT '',
  locales_permitidos JSONB DEFAULT '[]'::jsonb,
  max_horas_semana INTEGER DEFAULT 0,
  preferencias JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (colegio_id, id)
);

CREATE TABLE IF NOT EXISTS public.horario_teacher_availability (
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL,
  availability JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (colegio_id, teacher_id),
  FOREIGN KEY (colegio_id, teacher_id) REFERENCES public.horario_teachers(colegio_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.horario_slots (
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_break BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (colegio_id, day, slot_index)
);

CREATE TABLE IF NOT EXISTS public.horario_demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  hours_per_week INTEGER NOT NULL,
  required_room_type TEXT DEFAULT '',
  required_local_id TEXT DEFAULT '',
  FOREIGN KEY (colegio_id, section_id) REFERENCES public.horario_sections(colegio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (colegio_id, course_id) REFERENCES public.horario_courses(colegio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (colegio_id, teacher_id) REFERENCES public.horario_teachers(colegio_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS horario_demands_colegio_idx
ON public.horario_demands (colegio_id, section_id);

CREATE TABLE IF NOT EXISTS public.horario_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'global',
  target_id TEXT DEFAULT '',
  day TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  local_id TEXT DEFAULT '',
  FOREIGN KEY (colegio_id, day, slot_index) REFERENCES public.horario_slots(colegio_id, day, slot_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.horario_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.horario_runs(id) ON DELETE CASCADE,
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  day TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  course_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  local_id TEXT DEFAULT '',
  room_id TEXT DEFAULT '',
  UNIQUE (run_id, section_id, day, slot_index)
);

CREATE INDEX IF NOT EXISTS horario_items_run_idx
ON public.horario_items (run_id);

ALTER TABLE public.horario_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_travel_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horarios_read_locales" ON public.horario_locales;
DROP POLICY IF EXISTS "horarios_write_locales" ON public.horario_locales;
CREATE POLICY "horarios_read_locales" ON public.horario_locales FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_locales" ON public.horario_locales FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_travel" ON public.horario_travel_times;
DROP POLICY IF EXISTS "horarios_write_travel" ON public.horario_travel_times;
CREATE POLICY "horarios_read_travel" ON public.horario_travel_times FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_travel" ON public.horario_travel_times FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_rooms" ON public.horario_rooms;
DROP POLICY IF EXISTS "horarios_write_rooms" ON public.horario_rooms;
CREATE POLICY "horarios_read_rooms" ON public.horario_rooms FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_rooms" ON public.horario_rooms FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_courses" ON public.horario_courses;
DROP POLICY IF EXISTS "horarios_write_courses" ON public.horario_courses;
CREATE POLICY "horarios_read_courses" ON public.horario_courses FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_courses" ON public.horario_courses FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_sections" ON public.horario_sections;
DROP POLICY IF EXISTS "horarios_write_sections" ON public.horario_sections;
CREATE POLICY "horarios_read_sections" ON public.horario_sections FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_sections" ON public.horario_sections FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_teachers" ON public.horario_teachers;
DROP POLICY IF EXISTS "horarios_write_teachers" ON public.horario_teachers;
CREATE POLICY "horarios_read_teachers" ON public.horario_teachers FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_teachers" ON public.horario_teachers FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_avail" ON public.horario_teacher_availability;
DROP POLICY IF EXISTS "horarios_write_avail" ON public.horario_teacher_availability;
CREATE POLICY "horarios_read_avail" ON public.horario_teacher_availability FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_avail" ON public.horario_teacher_availability FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_slots" ON public.horario_slots;
DROP POLICY IF EXISTS "horarios_write_slots" ON public.horario_slots;
CREATE POLICY "horarios_read_slots" ON public.horario_slots FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_slots" ON public.horario_slots FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_demands" ON public.horario_demands;
DROP POLICY IF EXISTS "horarios_write_demands" ON public.horario_demands;
CREATE POLICY "horarios_read_demands" ON public.horario_demands FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_demands" ON public.horario_demands FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_events" ON public.horario_events;
DROP POLICY IF EXISTS "horarios_write_events" ON public.horario_events;
CREATE POLICY "horarios_read_events" ON public.horario_events FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_events" ON public.horario_events FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

DROP POLICY IF EXISTS "horarios_read_items" ON public.horario_items;
DROP POLICY IF EXISTS "horarios_write_items" ON public.horario_items;
CREATE POLICY "horarios_read_items" ON public.horario_items FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_items" ON public.horario_items FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

