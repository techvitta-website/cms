-- Add reference_source column to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS reference_source TEXT;











