-- SERGIO ACADEMY Report System - Database Schema (PostgreSQL / Supabase)
-- Includes Parent Portal & SMS capabilities

-- 1. Users Table (Extends Supabase Auth)
CREATE TABLE users (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'class_teacher', 'subject_teacher')),
    phone VARCHAR(20),
    username VARCHAR(100),
    initial_password VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Academic Terms / Settings
CREATE TABLE academic_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year VARCHAR(20) NOT NULL, -- e.g. "2024-2025"
    current_term VARCHAR(20) NOT NULL,  -- e.g. "Term 2"
    term_start_date DATE,
    term_end_date DATE,
    total_attendances INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT FALSE,    -- Only one term is active at a time
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2b. School SMS Settings
CREATE TABLE school_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_name VARCHAR(150) DEFAULT 'SERGIO ACADEMY',
    school_motto VARCHAR(255) DEFAULT 'Knowledge is Power',
    school_logo_url TEXT,
    school_address VARCHAR(255),
    school_contact VARCHAR(100),
    sms_api_key VARCHAR(255),
    sms_sender_id VARCHAR(50) DEFAULT 'SERGIO',
    allow_parent_view BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Classes
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,          -- e.g. "JHS 1A"
    department VARCHAR(50) NOT NULL CHECK (department IN ('preschool', 'lower_primary', 'upper_primary', 'jhs')),
    capacity INTEGER DEFAULT 50,
    form_master_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Nullable, links to a class_teacher
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Subjects
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,         -- e.g. "Mathematics"
    code VARCHAR(20) UNIQUE,            -- e.g. "MTH-JHS" (Optional, can be null)
    department VARCHAR(50) NOT NULL CHECK (department IN ('preschool', 'lower_primary', 'upper_primary', 'jhs')),
    is_active BOOLEAN DEFAULT TRUE
);

-- Mapping Table: Subject to Teacher Assignment
CREATE TABLE subject_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    UNIQUE(subject_id, teacher_id, class_id)
);

-- 5. Students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
    dob DATE,
    class_id UUID REFERENCES classes(id),
    admission_date DATE,
    guardian_name VARCHAR(255),
    guardian_contact VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'graduated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Attendance records (Per Term)
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    term_id UUID REFERENCES academic_settings(id),
    days_present INTEGER DEFAULT 0,
    days_absent INTEGER DEFAULT 0,
    days_late INTEGER DEFAULT 0,
    UNIQUE(student_id, term_id)
);

-- 7. Grades / Scores (Per Subject, Per Term)
CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    term_id UUID REFERENCES academic_settings(id),
    
    -- SBA Marks (Total of 40)
    class_exercise NUMERIC(5,2) DEFAULT 0 CHECK (class_exercise <= 10),
    group_work NUMERIC(5,2) DEFAULT 0 CHECK (group_work <= 10),
    project_work NUMERIC(5,2) DEFAULT 0 CHECK (project_work <= 10),
    individual_assessment NUMERIC(5,2) DEFAULT 0 CHECK (individual_assessment <= 10),
    
    -- Exam Marks (Raw out of 100)
    raw_exam_score NUMERIC(5,2) DEFAULT 0 CHECK (raw_exam_score <= 100),
    
    -- Accountability
    graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    
    UNIQUE(student_id, subject_id, term_id)
);

-- 8. Remarks (Overall Per Term)
CREATE TABLE remarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    term_id UUID REFERENCES academic_settings(id),
    
    -- Form Master Inputs
    class_teacher_remark TEXT,
    conduct TEXT,
    interest TEXT,
    
    -- Admin/Head Inputs
    headteacher_remark TEXT,
    
    UNIQUE(student_id, term_id)
);

-- Helper trigger to auto-update 'updated_at' columns
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_grades_modtime 
BEFORE UPDATE ON grades 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_academic_modtime 
BEFORE UPDATE ON academic_settings 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_school_modtime 
BEFORE UPDATE ON school_settings 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- 9. Dynamic Grading System
-- Stores the grade scale (e.g. A: 80-100, B: 70-79) for dynamic reporting
CREATE TABLE grading_system (
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

-- 10. Term Publishing Status (For Report Cards)
CREATE TABLE term_publishing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id UUID REFERENCES academic_settings(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL CHECK (department IN ('preschool', 'lower_primary', 'upper_primary', 'jhs')),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    is_published BOOLEAN DEFAULT FALSE,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(term_id, class_id)
);

CREATE TRIGGER update_publishing_modtime 
BEFORE UPDATE ON term_publishing_status 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

