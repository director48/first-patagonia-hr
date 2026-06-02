-- ============================================================
-- Tabla de pagos — ejecuta en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  concept TEXT NOT NULL DEFAULT 'Sueldo mensual',
  status TEXT NOT NULL DEFAULT 'pagado' CHECK (status IN ('pendiente', 'pagado')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, period)
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_read" ON payments FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "payments_write_admin" ON payments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
