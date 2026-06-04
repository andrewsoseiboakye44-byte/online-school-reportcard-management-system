-- 1. Safely force RLS ON for the remaining missing tables
ALTER TABLE public.academic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_system ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_publishing_status ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow auth full access to academic_settings" ON public.academic_settings;
DROP POLICY IF EXISTS "Allow auth full access to school_settings" ON public.school_settings;
DROP POLICY IF EXISTS "Allow auth full access to subject_teachers" ON public.subject_teachers;
DROP POLICY IF EXISTS "Allow auth full access to class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "Allow auth full access to grading_system" ON public.grading_system;
DROP POLICY IF EXISTS "Allow auth full access to term_publishing" ON public.term_publishing_status;
DROP POLICY IF EXISTS "Allow authenticated full access to class_subjects" ON public.class_subjects; -- Drop the old one just in case

-- 3. Create permissive policies for authenticated users
CREATE POLICY "Allow auth full access to academic_settings" ON public.academic_settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow auth full access to school_settings" ON public.school_settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow auth full access to subject_teachers" ON public.subject_teachers FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow auth full access to class_subjects" ON public.class_subjects FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow auth full access to grading_system" ON public.grading_system FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow auth full access to term_publishing" ON public.term_publishing_status FOR ALL TO authenticated USING (true);

-- Allow unauthenticated access (anon) purely for READ operations on school_settings/academic_settings if needed during login (e.g. showing school name before login)
DROP POLICY IF EXISTS "Allow anon read school_settings" ON public.school_settings;
CREATE POLICY "Allow anon read school_settings" ON public.school_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon read academic_settings" ON public.academic_settings;
CREATE POLICY "Allow anon read academic_settings" ON public.academic_settings FOR SELECT USING (true);
