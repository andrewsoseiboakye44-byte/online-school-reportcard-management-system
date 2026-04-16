-- Migration to add Term Publishing Status and update School Settings

-- 1. Add new columns to school_settings if they don't exist
ALTER TABLE school_settings 
ADD COLUMN IF NOT EXISTS school_logo_url TEXT,
ADD COLUMN IF NOT EXISTS school_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS school_contact VARCHAR(100);

-- 2. Create the Term Publishing Status Table for Admin workflow
CREATE TABLE IF NOT EXISTS term_publishing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id UUID REFERENCES academic_settings(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL CHECK (department IN ('preschool', 'lower_primary', 'upper_primary', 'jhs')),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    is_published BOOLEAN DEFAULT FALSE,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(term_id, class_id)
);

-- Trigger for updated_at (Requires update_modified_column function from 001 schema)
ALTER TABLE term_publishing_status ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

CREATE TRIGGER update_publishing_modtime 
BEFORE UPDATE ON term_publishing_status 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Update schema reference to include new table and columns
