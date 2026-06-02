-- ============================================================
-- First Patagonia HR — Supabase Setup
-- Pega esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- PERFILES (extiende auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  hire_date DATE,
  vacation_days_total INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TURNOS ASIGNADOS
CREATE TABLE IF NOT EXISTS schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- FICHAJE REAL (entrada/salida)
CREATE TABLE IF NOT EXISTS clock_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- SOLICITUDES DE DÍAS LIBRES
CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'vacaciones' CHECK (type IN ('vacaciones', 'licencia_medica', 'permiso_administrativo', 'otro')),
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  admin_notes TEXT DEFAULT '',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HORAS EXTRAS
CREATE TABLE IF NOT EXISTS overtime_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL CHECK (hours > 0 AND hours <= 12),
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  admin_notes TEXT DEFAULT '',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE clock_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_records ENABLE ROW LEVEL SECURITY;

-- Función helper (SECURITY DEFINER evita recursión en RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- PROFILES
CREATE POLICY "profiles_read" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR is_admin());

-- SCHEDULES
CREATE POLICY "schedules_read" ON schedules FOR SELECT TO authenticated USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "schedules_write_admin" ON schedules FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- CLOCK RECORDS
CREATE POLICY "clock_read" ON clock_records FOR SELECT TO authenticated USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "clock_insert" ON clock_records FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "clock_update" ON clock_records FOR UPDATE TO authenticated USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "clock_admin_all" ON clock_records FOR ALL TO authenticated USING (is_admin());

-- TIME OFF
CREATE POLICY "timeoff_read" ON time_off_requests FOR SELECT TO authenticated USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "timeoff_insert" ON time_off_requests FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "timeoff_update_admin" ON time_off_requests FOR UPDATE TO authenticated USING (is_admin());

-- OVERTIME
CREATE POLICY "overtime_read" ON overtime_records FOR SELECT TO authenticated USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "overtime_insert" ON overtime_records FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
CREATE POLICY "overtime_update_admin" ON overtime_records FOR UPDATE TO authenticated USING (is_admin());

-- ============================================================
-- TRIGGER: crear perfil automáticamente al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
