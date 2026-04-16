-- Run this in your Supabase SQL Editor to add the dynamic grading system

CREATE TABLE IF NOT EXISTS grading_system (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade VARCHAR(5) NOT NULL,
    min_score NUMERIC(5,2) NOT NULL,
    max_score NUMERIC(5,2) NOT NULL,
    remark VARCHAR(100) NOT NULL,
    badge_class VARCHAR(50) DEFAULT 'bg-secondary',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER update_grading_sys_modtime 
BEFORE UPDATE ON grading_system 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Insert Default GES Grading System
INSERT INTO grading_system (grade, min_score, max_score, remark, badge_class) VALUES
('A', 80, 100, 'Highest', 'badge-A'),
('B', 70, 79.99, 'Higher', 'badge-B'),
('C', 60, 69.99, 'High', 'badge-C'),
('D', 50, 59.99, 'High Average', 'badge-D'),
('E', 40, 49.99, 'Average', 'badge-E'),
('F', 0, 39.99, 'Low', 'badge-F');
