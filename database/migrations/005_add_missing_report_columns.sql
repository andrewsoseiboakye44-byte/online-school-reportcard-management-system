-- Migration to add missing columns for school_settings and academic_settings
-- Run this in your Supabase SQL Editor

-- 1. Add school_email to school_settings
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS school_email text;

-- 2. Add next_term_begin_date to academic_settings
ALTER TABLE public.academic_settings 
ADD COLUMN IF NOT EXISTS next_term_begin_date date;
