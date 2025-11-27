-- Create resume_scores table for storing AI-analyzed resume data
CREATE TABLE IF NOT EXISTS resume_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on score for faster sorting
CREATE INDEX IF NOT EXISTS idx_resume_scores_score ON resume_scores(score DESC);

-- Create index on file_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_resume_scores_file_name ON resume_scores(file_name);

-- Enable Row Level Security
ALTER TABLE resume_scores ENABLE ROW LEVEL SECURITY;

-- Allow public read access (or adjust based on your security requirements)
CREATE POLICY "Allow public read access" ON resume_scores
  FOR SELECT
  USING (true);

-- Allow service role to insert/update/delete (for Edge Functions)
CREATE POLICY "Allow service role full access" ON resume_scores
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_resume_scores_updated_at
  BEFORE UPDATE ON resume_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();






