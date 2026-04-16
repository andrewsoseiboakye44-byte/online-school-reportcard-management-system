-- Fix missing RLS Policies causing "violates row-level security policy"
-- This ensures the frontend app can view, add, and edit data.

-- 1. Explicitly enable RLS safely so we can attach permissions
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remarks ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any to prevent conflicts
DROP POLICY IF EXISTS "Allow authenticated full access to classes" ON public.classes;
DROP POLICY IF EXISTS "Allow authenticated full access to students" ON public.students;
DROP POLICY IF EXISTS "Allow authenticated full access to subjects" ON public.subjects;
DROP POLICY IF EXISTS "Allow authenticated full access to users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated full access to attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated full access to grades" ON public.grades;
DROP POLICY IF EXISTS "Allow authenticated full access to remarks" ON public.remarks;

-- 3. Create permissive policies for authenticated users
CREATE POLICY "Allow authenticated full access to classes" ON public.classes FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to students" ON public.students FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to subjects" ON public.subjects FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to users" ON public.users FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to attendance" ON public.attendance FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to grades" ON public.grades FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to remarks" ON public.remarks FOR ALL TO authenticated USING (true);
