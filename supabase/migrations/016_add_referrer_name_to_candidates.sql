-- ============================================
-- Add referrer_name column to candidates table
-- Migration: 016_add_referrer_name_to_candidates.sql
-- ============================================

-- Add referrer_name column to candidates table
ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS referrer_name TEXT;

-- Add comment to column
COMMENT ON COLUMN candidates.referrer_name IS 'Name of the person who referred this candidate through the website';





