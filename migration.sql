
-- Add missing columns to study_cards table
ALTER TABLE study_cards 
ADD COLUMN IF NOT EXISTS study_days JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS study_start_time VARCHAR,
ADD COLUMN IF NOT EXISTS study_duration INTEGER,
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS weekly_frequency INTEGER,
ADD COLUMN IF NOT EXISTS study_description TEXT;
