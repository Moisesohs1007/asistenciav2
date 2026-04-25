-- Migración: soporte multi-jornada + locales virtuales
-- Ejecutar en Supabase SQL Editor (una sola vez) después de horarios_schema.sql

-- 1) Jornadas
CREATE TABLE IF NOT EXISTS public.horario_jornadas (
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'normal',
  nivel TEXT DEFAULT '',
  compare_group TEXT NOT NULL DEFAULT '',
  descripcion TEXT DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (colegio_id, id)
);

-- columnas nuevas (si la tabla ya existía)
ALTER TABLE public.horario_jornadas
ADD COLUMN IF NOT EXISTS nivel TEXT DEFAULT '';

ALTER TABLE public.horario_jornadas
ADD COLUMN IF NOT EXISTS compare_group TEXT NOT NULL DEFAULT '';

ALTER TABLE public.horario_jornadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "horarios_read_jornadas" ON public.horario_jornadas;
DROP POLICY IF EXISTS "horarios_write_jornadas" ON public.horario_jornadas;
CREATE POLICY "horarios_read_jornadas"  ON public.horario_jornadas FOR SELECT USING (colegio_id = auth_colegio_id() AND is_staff());
CREATE POLICY "horarios_write_jornadas" ON public.horario_jornadas FOR ALL   USING (colegio_id = auth_colegio_id() AND is_staff());

-- 2) Locales virtuales (flag)
ALTER TABLE public.horario_locales
ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) Secciones: jornada_id (referencia lógica)
ALTER TABLE public.horario_sections
ADD COLUMN IF NOT EXISTS jornada_id TEXT NOT NULL DEFAULT 'DEFAULT';

-- 4) Slots: jornada_id + PK extendida
ALTER TABLE public.horario_slots
ADD COLUMN IF NOT EXISTS jornada_id TEXT NOT NULL DEFAULT 'DEFAULT';

-- IMPORTANTE: soltar cualquier FK que apunte al PK anterior de horario_slots (puede tener nombres distintos si se ejecutó parcialmente)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'public.horario_slots'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='horario_slots' AND constraint_type='PRIMARY KEY'
  ) THEN
    EXECUTE 'ALTER TABLE public.horario_slots DROP CONSTRAINT IF EXISTS horario_slots_pkey';
  END IF;
END $$;

ALTER TABLE public.horario_slots
ADD CONSTRAINT horario_slots_pkey PRIMARY KEY (colegio_id, jornada_id, day, slot_index);

-- 5) Events: jornada_id + FK nueva a slots
ALTER TABLE public.horario_events
ADD COLUMN IF NOT EXISTS jornada_id TEXT NOT NULL DEFAULT 'DEFAULT';

ALTER TABLE public.horario_events
DROP CONSTRAINT IF EXISTS horario_events_slots_fkey;

ALTER TABLE public.horario_events
ADD CONSTRAINT horario_events_slots_fkey
FOREIGN KEY (colegio_id, jornada_id, day, slot_index)
REFERENCES public.horario_slots (colegio_id, jornada_id, day, slot_index)
ON DELETE CASCADE;

-- 6) Items: jornada_id + unique extendida
ALTER TABLE public.horario_items
ADD COLUMN IF NOT EXISTS jornada_id TEXT NOT NULL DEFAULT 'DEFAULT';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='horario_items' AND constraint_name='horario_items_run_id_section_id_day_slot_index_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.horario_items DROP CONSTRAINT IF EXISTS horario_items_run_id_section_id_day_slot_index_key';
  END IF;
END $$;

ALTER TABLE public.horario_items
ADD CONSTRAINT horario_items_run_section_jornada_day_slot_uniq UNIQUE (run_id, section_id, jornada_id, day, slot_index);

-- 7) Seed: jornada DEFAULT (si no existe)
INSERT INTO public.horario_jornadas (colegio_id, id, nombre, tipo, descripcion, is_default)
SELECT c.id, 'DEFAULT', 'Jornada', 'normal', 'Jornada por defecto', TRUE
FROM public.colegios c
WHERE NOT EXISTS (
  SELECT 1 FROM public.horario_jornadas j WHERE j.colegio_id = c.id AND j.id = 'DEFAULT'
);

-- Asegurar compare_group por defecto
UPDATE public.horario_jornadas
SET compare_group = CASE WHEN COALESCE(compare_group,'') = '' THEN id ELSE compare_group END
WHERE COALESCE(compare_group,'') = '';
