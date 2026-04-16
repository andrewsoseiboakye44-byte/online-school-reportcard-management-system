-- SUPPLEMENTARY DATABASE LOGIC
-- Execution: Run this in the Supabase SQL Editor AFTER schema.sql

-- 1. Auto-Generate Student ID Function
-- Format: SER-YY-NNN (e.g. SER-24-001)
CREATE OR REPLACE FUNCTION generate_student_id()
RETURNS TRIGGER AS $$
DECLARE
    current_year VARCHAR(2);
    next_seq INTEGER;
    formatted_id VARCHAR(20);
BEGIN
    -- Get last 2 digits of current year
    current_year := to_char(CURRENT_DATE, 'YY');
    
    -- Count existing students enrolled this year to find the next sequence
    SELECT COUNT(*) + 1 INTO next_seq
    FROM students
    WHERE student_id_number LIKE 'SER-' || current_year || '-%';
    
    -- Format with zero padding (e.g., 001, 042)
    formatted_id := 'SER-' || current_year || '-' || LPAD(next_seq::TEXT, 3, '0');
    
    -- Assign the generated ID to the new row
    NEW.student_id_number := formatted_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the students table before insert
DROP TRIGGER IF EXISTS trg_generate_student_id ON students;
CREATE TRIGGER trg_generate_student_id
BEFORE INSERT ON students
FOR EACH ROW
WHEN (NEW.student_id_number IS NULL OR NEW.student_id_number = '')
EXECUTE FUNCTION generate_student_id();
