-- 1. Enforce at most one active academic term in the database
-- First, deactivate any duplicate active terms, keeping only the most recently updated one
WITH latest_active AS (
  SELECT id FROM academic_settings 
  WHERE is_active = true 
  ORDER BY updated_at DESC 
  LIMIT 1
)
UPDATE academic_settings 
SET is_active = false 
WHERE is_active = true 
AND id NOT IN (SELECT id FROM latest_active);

-- Create a partial unique index so PostgreSQL guarantees only one active term can ever exist
DROP INDEX IF EXISTS active_term_unique_idx;
CREATE UNIQUE INDEX active_term_unique_idx ON academic_settings (is_active) WHERE (is_active = true);

-- 2. Grant SELECT access to unauthenticated (anon) users for the parent portal
DROP POLICY IF EXISTS "Allow anon read students" ON public.students;
CREATE POLICY "Allow anon read students" ON public.students FOR SELECT TO anon USING (status = 'active');

DROP POLICY IF EXISTS "Allow anon read classes" ON public.classes;
CREATE POLICY "Allow anon read classes" ON public.classes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read term_publishing_status" ON public.term_publishing_status;
CREATE POLICY "Allow anon read term_publishing_status" ON public.term_publishing_status FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read subjects" ON public.subjects;
CREATE POLICY "Allow anon read subjects" ON public.subjects FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "Allow anon read class_subjects" ON public.class_subjects;
CREATE POLICY "Allow anon read class_subjects" ON public.class_subjects FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read grading_system" ON public.grading_system;
CREATE POLICY "Allow anon read grading_system" ON public.grading_system FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read grades" ON public.grades;
CREATE POLICY "Allow anon read grades" ON public.grades FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read remarks" ON public.remarks;
CREATE POLICY "Allow anon read remarks" ON public.remarks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance;
CREATE POLICY "Allow anon read attendance" ON public.attendance FOR SELECT TO anon USING (true);
