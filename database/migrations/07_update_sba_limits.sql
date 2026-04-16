-- 07_update_sba_limits.sql
-- Run this in the Supabase SQL Editor.
-- This increases the check constraints from 10 to 15 to match the new professional format.

DO $$
BEGIN
    -- Drop existing constraints if they exist
    BEGIN
        ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_class_exercise_check;
        ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_group_work_check;
        ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_project_work_check;
        ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_individual_assessment_check;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Add the updated max constraints (up to 15)
    ALTER TABLE grades ADD CONSTRAINT grades_class_exercise_check CHECK (class_exercise <= 15);
    ALTER TABLE grades ADD CONSTRAINT grades_group_work_check CHECK (group_work <= 15);
    ALTER TABLE grades ADD CONSTRAINT grades_project_work_check CHECK (project_work <= 15);
    ALTER TABLE grades ADD CONSTRAINT grades_individual_assessment_check CHECK (individual_assessment <= 15);
END $$;
