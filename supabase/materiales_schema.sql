CREATE OR REPLACE FUNCTION is_admin_or_director()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_rol() IN ('admin','director')
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

CREATE TABLE IF NOT EXISTS public.material_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  anio TEXT NOT NULL DEFAULT '',
  grado TEXT NOT NULL,
  seccion TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  locked BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID
);

CREATE INDEX IF NOT EXISTS material_templates_scope_idx
ON public.material_templates (colegio_id, anio, grado, seccion);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_templates_colegio_id_id_uniq
ON public.material_templates (colegio_id, id);

ALTER TABLE public.material_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_templates_read" ON public.material_templates;
DROP POLICY IF EXISTS "material_templates_write_admin" ON public.material_templates;
DROP POLICY IF EXISTS "material_templates_write_tutor" ON public.material_templates;

CREATE POLICY "material_templates_read" ON public.material_templates FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (is_tutor() AND grado = tutor_grado() AND seccion = tutor_seccion())
    )
  );

CREATE POLICY "material_templates_write_admin" ON public.material_templates FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_templates_write_tutor" ON public.material_templates FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
    AND locked = TRUE
    AND created_by = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.material_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.material_templates(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'Materiales',
  nombre_item TEXT NOT NULL,
  nombre_key TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'UND',
  unidad_otro TEXT DEFAULT '',
  cantidad_requerida NUMERIC(10,2) NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS material_template_items_tpl_idx
ON public.material_template_items (colegio_id, template_id);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_template_items_colegio_id_id_uniq
ON public.material_template_items (colegio_id, id);

ALTER TABLE public.material_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_template_items_read" ON public.material_template_items;
DROP POLICY IF EXISTS "material_template_items_write_admin" ON public.material_template_items;
DROP POLICY IF EXISTS "material_template_items_write_tutor" ON public.material_template_items;

CREATE POLICY "material_template_items_read" ON public.material_template_items FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (
        is_tutor()
        AND EXISTS (
          SELECT 1 FROM public.material_templates t
          WHERE t.id = template_id
            AND t.colegio_id = material_template_items.colegio_id
            AND t.grado = tutor_grado()
            AND t.seccion = tutor_seccion()
        )
      )
    )
  );

CREATE POLICY "material_template_items_write_admin" ON public.material_template_items FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_template_items_write_tutor" ON public.material_template_items FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND EXISTS (
      SELECT 1 FROM public.material_templates t
      WHERE t.id = template_id
        AND t.colegio_id = material_template_items.colegio_id
        AND t.grado = tutor_grado()
        AND t.seccion = tutor_seccion()
        AND t.locked = TRUE
        AND t.created_by = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.material_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.material_templates(id) ON DELETE RESTRICT,
  alumno_id TEXT NOT NULL,
  grado TEXT NOT NULL DEFAULT '',
  seccion TEXT NOT NULL DEFAULT '',
  tutor_user_id UUID NOT NULL,
  estado TEXT NOT NULL DEFAULT 'incompleto'
);

CREATE UNIQUE INDEX IF NOT EXISTS material_receipts_uniq
ON public.material_receipts (colegio_id, template_id, alumno_id);

-- Para compat.js: db.collection(...).add() usa insert, pero otras operaciones pueden usar doc(id).set()
CREATE UNIQUE INDEX IF NOT EXISTS material_receipts_colegio_id_id_uniq
ON public.material_receipts (colegio_id, id);

CREATE INDEX IF NOT EXISTS material_receipts_scope_idx
ON public.material_receipts (colegio_id, tutor_user_id, updated_at DESC);

ALTER TABLE public.material_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_receipts_read" ON public.material_receipts;
DROP POLICY IF EXISTS "material_receipts_write_admin" ON public.material_receipts;
DROP POLICY IF EXISTS "material_receipts_write_tutor" ON public.material_receipts;

CREATE POLICY "material_receipts_read" ON public.material_receipts FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (is_tutor() AND tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "material_receipts_write_admin" ON public.material_receipts FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_receipts_write_tutor" ON public.material_receipts FOR ALL
  USING (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND tutor_user_id = auth.uid()
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND tutor_user_id = auth.uid()
    AND grado = tutor_grado()
    AND seccion = tutor_seccion()
  );

CREATE TABLE IF NOT EXISTS public.material_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES public.material_receipts(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES public.material_template_items(id) ON DELETE RESTRICT,
  cantidad_entregada NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS material_receipt_items_uniq
ON public.material_receipt_items (colegio_id, receipt_id, template_item_id);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_receipt_items_colegio_id_id_uniq
ON public.material_receipt_items (colegio_id, id);

ALTER TABLE public.material_receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_receipt_items_read" ON public.material_receipt_items;
DROP POLICY IF EXISTS "material_receipt_items_write_admin" ON public.material_receipt_items;
DROP POLICY IF EXISTS "material_receipt_items_write_tutor" ON public.material_receipt_items;

CREATE POLICY "material_receipt_items_read" ON public.material_receipt_items FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (
        is_tutor()
        AND EXISTS (
          SELECT 1 FROM public.material_receipts r
          WHERE r.id = receipt_id
            AND r.colegio_id = material_receipt_items.colegio_id
            AND r.tutor_user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "material_receipt_items_write_admin" ON public.material_receipt_items FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_receipt_items_write_tutor" ON public.material_receipt_items FOR ALL
  USING (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND EXISTS (
      SELECT 1 FROM public.material_receipts r
      WHERE r.id = receipt_id
        AND r.colegio_id = material_receipt_items.colegio_id
        AND r.tutor_user_id = auth.uid()
    )
  )
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND updated_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.material_receipts r
      WHERE r.id = receipt_id
        AND r.colegio_id = material_receipt_items.colegio_id
        AND r.tutor_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.material_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  tutor_user_id UUID NOT NULL,
  admin_user_id UUID,
  estado TEXT NOT NULL DEFAULT 'borrador',
  delivered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  observaciones TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS material_handoffs_scope_idx
ON public.material_handoffs (colegio_id, estado, created_at DESC);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_handoffs_colegio_id_id_uniq
ON public.material_handoffs (colegio_id, id);

ALTER TABLE public.material_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_handoffs_read" ON public.material_handoffs;
DROP POLICY IF EXISTS "material_handoffs_write_admin" ON public.material_handoffs;
DROP POLICY IF EXISTS "material_handoffs_write_tutor" ON public.material_handoffs;

CREATE POLICY "material_handoffs_read" ON public.material_handoffs FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (is_tutor() AND tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "material_handoffs_write_admin" ON public.material_handoffs FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_handoffs_write_tutor" ON public.material_handoffs FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND tutor_user_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.material_handoff_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  handoff_id UUID NOT NULL REFERENCES public.material_handoffs(id) ON DELETE CASCADE,
  nombre_item TEXT NOT NULL,
  nombre_key TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'UND',
  unidad_otro TEXT DEFAULT '',
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS material_handoff_items_idx
ON public.material_handoff_items (colegio_id, handoff_id);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_handoff_items_colegio_id_id_uniq
ON public.material_handoff_items (colegio_id, id);

ALTER TABLE public.material_handoff_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_handoff_items_read" ON public.material_handoff_items;
DROP POLICY IF EXISTS "material_handoff_items_write_admin" ON public.material_handoff_items;
DROP POLICY IF EXISTS "material_handoff_items_write_tutor" ON public.material_handoff_items;

CREATE POLICY "material_handoff_items_read" ON public.material_handoff_items FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (
        is_tutor()
        AND EXISTS (
          SELECT 1 FROM public.material_handoffs h
          WHERE h.id = handoff_id
            AND h.colegio_id = material_handoff_items.colegio_id
            AND h.tutor_user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "material_handoff_items_write_admin" ON public.material_handoff_items FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_handoff_items_write_tutor" ON public.material_handoff_items FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND EXISTS (
      SELECT 1 FROM public.material_handoffs h
      WHERE h.id = handoff_id
        AND h.colegio_id = material_handoff_items.colegio_id
        AND h.tutor_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.inventory_tutor_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  tutor_user_id UUID NOT NULL,
  nombre_item_display TEXT NOT NULL DEFAULT '',
  nombre_key TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'UND',
  unidad_otro TEXT DEFAULT '',
  stock_actual NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_tutor_stock_uniq
ON public.inventory_tutor_stock (colegio_id, tutor_user_id, nombre_key, unidad);

ALTER TABLE public.inventory_tutor_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_tutor_stock_read" ON public.inventory_tutor_stock;
DROP POLICY IF EXISTS "inventory_tutor_stock_write_admin" ON public.inventory_tutor_stock;

CREATE POLICY "inventory_tutor_stock_read" ON public.inventory_tutor_stock FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (is_tutor() AND tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "inventory_tutor_stock_write_admin" ON public.inventory_tutor_stock FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE TABLE IF NOT EXISTS public.inventory_tutor_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  tutor_user_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  nombre_item TEXT NOT NULL DEFAULT '',
  nombre_key TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'UND',
  unidad_otro TEXT DEFAULT '',
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 0,
  ref_tipo TEXT NOT NULL DEFAULT '',
  ref_id UUID,
  created_by UUID
);

CREATE INDEX IF NOT EXISTS inventory_tutor_movements_idx
ON public.inventory_tutor_movements (colegio_id, tutor_user_id, created_at DESC);

ALTER TABLE public.inventory_tutor_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_tutor_movements_read" ON public.inventory_tutor_movements;
DROP POLICY IF EXISTS "inventory_tutor_movements_write_admin" ON public.inventory_tutor_movements;

CREATE POLICY "inventory_tutor_movements_read" ON public.inventory_tutor_movements FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (is_tutor() AND tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "inventory_tutor_movements_write_admin" ON public.inventory_tutor_movements FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE TABLE IF NOT EXISTS public.material_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  tutor_user_id UUID NOT NULL,
  admin_user_id UUID,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  observaciones TEXT DEFAULT '',
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS material_requests_idx
ON public.material_requests (colegio_id, estado, created_at DESC);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_requests_colegio_id_id_uniq
ON public.material_requests (colegio_id, id);

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_requests_read" ON public.material_requests;
DROP POLICY IF EXISTS "material_requests_write_admin" ON public.material_requests;
DROP POLICY IF EXISTS "material_requests_write_tutor" ON public.material_requests;

CREATE POLICY "material_requests_read" ON public.material_requests FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (is_tutor() AND tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "material_requests_write_admin" ON public.material_requests FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_requests_write_tutor" ON public.material_requests FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND tutor_user_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS public.material_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  colegio_id TEXT NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  nombre_item TEXT NOT NULL,
  nombre_key TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'UND',
  unidad_otro TEXT DEFAULT '',
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS material_request_items_idx
ON public.material_request_items (colegio_id, request_id);

-- Para compat.js: db.collection(...).doc(id).set() usa upsert con onConflict 'colegio_id,id'
CREATE UNIQUE INDEX IF NOT EXISTS material_request_items_colegio_id_id_uniq
ON public.material_request_items (colegio_id, id);

ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_request_items_read" ON public.material_request_items;
DROP POLICY IF EXISTS "material_request_items_write_admin" ON public.material_request_items;
DROP POLICY IF EXISTS "material_request_items_write_tutor" ON public.material_request_items;

CREATE POLICY "material_request_items_read" ON public.material_request_items FOR SELECT
  USING (
    colegio_id = auth_colegio_id()
    AND (
      is_admin_or_director()
      OR (
        is_tutor()
        AND EXISTS (
          SELECT 1 FROM public.material_requests r
          WHERE r.id = request_id
            AND r.colegio_id = material_request_items.colegio_id
            AND r.tutor_user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "material_request_items_write_admin" ON public.material_request_items FOR ALL
  USING (colegio_id = auth_colegio_id() AND is_admin_or_director());

CREATE POLICY "material_request_items_write_tutor" ON public.material_request_items FOR INSERT
  WITH CHECK (
    colegio_id = auth_colegio_id()
    AND is_tutor()
    AND EXISTS (
      SELECT 1 FROM public.material_requests r
      WHERE r.id = request_id
        AND r.colegio_id = material_request_items.colegio_id
        AND r.tutor_user_id = auth.uid()
    )
  );

CREATE OR REPLACE VIEW public.inventory_stock_global_v AS
SELECT
  colegio_id,
  nombre_key,
  unidad,
  COALESCE(MAX(NULLIF(nombre_item_display,'')), '') AS nombre_item_display,
  SUM(stock_actual) AS stock_actual
FROM public.inventory_tutor_stock
GROUP BY colegio_id, nombre_key, unidad;

CREATE OR REPLACE FUNCTION confirm_material_handoff(p_handoff_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  it RECORD;
BEGIN
  IF NOT is_admin_or_director() THEN
    RAISE EXCEPTION 'No permitido';
  END IF;

  SELECT * INTO h
  FROM public.material_handoffs
  WHERE id = p_handoff_id
    AND colegio_id = auth_colegio_id()
  FOR UPDATE;

  IF h.id IS NULL THEN
    RAISE EXCEPTION 'No existe';
  END IF;
  IF h.estado = 'confirmado' THEN
    RETURN;
  END IF;

  UPDATE public.material_handoffs
  SET estado = 'confirmado',
      admin_user_id = auth.uid(),
      received_at = NOW()
  WHERE id = p_handoff_id;

  FOR it IN
    SELECT * FROM public.material_handoff_items
    WHERE colegio_id = auth_colegio_id()
      AND handoff_id = p_handoff_id
  LOOP
    INSERT INTO public.inventory_tutor_stock (
      colegio_id, tutor_user_id, nombre_item_display, nombre_key, unidad, unidad_otro, stock_actual
    ) VALUES (
      auth_colegio_id(), h.tutor_user_id, it.nombre_item, it.nombre_key, it.unidad, it.unidad_otro, it.cantidad
    )
    ON CONFLICT (colegio_id, tutor_user_id, nombre_key, unidad)
    DO UPDATE SET
      stock_actual = public.inventory_tutor_stock.stock_actual + EXCLUDED.stock_actual,
      nombre_item_display = CASE WHEN EXCLUDED.nombre_item_display <> '' THEN EXCLUDED.nombre_item_display ELSE public.inventory_tutor_stock.nombre_item_display END,
      unidad_otro = CASE WHEN EXCLUDED.unidad_otro <> '' THEN EXCLUDED.unidad_otro ELSE public.inventory_tutor_stock.unidad_otro END,
      updated_at = NOW();

    INSERT INTO public.inventory_tutor_movements (
      colegio_id, tutor_user_id, tipo, nombre_item, nombre_key, unidad, unidad_otro, cantidad, ref_tipo, ref_id, created_by
    ) VALUES (
      auth_colegio_id(), h.tutor_user_id, 'IN', it.nombre_item, it.nombre_key, it.unidad, it.unidad_otro, it.cantidad, 'handoff', p_handoff_id, auth.uid()
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_material_handoff(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION approve_material_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  it RECORD;
  st RECORD;
BEGIN
  IF NOT is_admin_or_director() THEN
    RAISE EXCEPTION 'No permitido';
  END IF;

  SELECT * INTO r
  FROM public.material_requests
  WHERE id = p_request_id
    AND colegio_id = auth_colegio_id()
  FOR UPDATE;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'No existe';
  END IF;
  IF r.estado = 'aprobado' THEN
    RETURN;
  END IF;

  FOR it IN
    SELECT * FROM public.material_request_items
    WHERE colegio_id = auth_colegio_id()
      AND request_id = p_request_id
  LOOP
    SELECT * INTO st
    FROM public.inventory_tutor_stock
    WHERE colegio_id = auth_colegio_id()
      AND tutor_user_id = r.tutor_user_id
      AND nombre_key = it.nombre_key
      AND unidad = it.unidad
    FOR UPDATE;

    IF st.id IS NULL THEN
      RAISE EXCEPTION 'Sin stock: % (%)', it.nombre_item, it.unidad;
    END IF;
    IF st.stock_actual < it.cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente: % (%). Disponible %, requerido %', it.nombre_item, it.unidad, st.stock_actual, it.cantidad;
    END IF;

    UPDATE public.inventory_tutor_stock
    SET stock_actual = stock_actual - it.cantidad,
        updated_at = NOW()
    WHERE id = st.id;

    INSERT INTO public.inventory_tutor_movements (
      colegio_id, tutor_user_id, tipo, nombre_item, nombre_key, unidad, unidad_otro, cantidad, ref_tipo, ref_id, created_by
    ) VALUES (
      auth_colegio_id(), r.tutor_user_id, 'OUT', it.nombre_item, it.nombre_key, it.unidad, it.unidad_otro, it.cantidad, 'request', p_request_id, auth.uid()
    );
  END LOOP;

  UPDATE public.material_requests
  SET estado = 'aprobado',
      admin_user_id = auth.uid(),
      approved_at = NOW()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_material_request(UUID) TO authenticated;
