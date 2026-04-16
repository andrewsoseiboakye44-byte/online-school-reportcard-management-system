-- Migration: Create Class Subjects Registration Mapping
-- This table allows administrators to assign master subjects to an entire class regardless of teacher assignment.
-- This ensures report cards generate properly with 12 subjects (for JHS) even if grades are missing.

CREATE TABLE IF NOT EXISTS public.class_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(class_id, subject_id)
);

-- Enable Row Level Security
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- Create basic access policies (assuming your app uses standard authenticated roles)
CREATE POLICY "Allow authenticated full access to class_subjects" 
ON public.class_subjects 
FOR ALL USING (auth.role() = 'authenticated');
