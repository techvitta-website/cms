-- Create offer-letters table (with proper quoting for hyphens)
-- Run this SQL in Supabase Dashboard → SQL Editor

-- Drop table if it exists (in case of previous failed attempts)
DROP TABLE IF EXISTS "offer-letters" CASCADE;

-- Create the table with all columns
CREATE TABLE "offer-letters" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  department TEXT NOT NULL,
  internship_type TEXT NOT NULL CHECK (internship_type IN ('Paid', 'Unpaid')),
  salary TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  manager_name TEXT NOT NULL,
  joining_location TEXT NOT NULL,
  email TEXT NOT NULL,
  offer_letter_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_offer_letters_candidate_id ON "offer-letters"(candidate_id);
CREATE INDEX idx_offer_letters_created_at ON "offer-letters"(created_at DESC);

-- Enable Row Level Security
ALTER TABLE "offer-letters" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON "offer-letters";
DROP POLICY IF EXISTS "Allow public insert access" ON "offer-letters";
DROP POLICY IF EXISTS "Allow public update access" ON "offer-letters";
DROP POLICY IF EXISTS "Allow service role full access" ON "offer-letters";
DROP POLICY IF EXISTS "Allow authenticated users to read offer letters" ON "offer-letters";
DROP POLICY IF EXISTS "Allow authenticated users to insert offer letters" ON "offer-letters";
DROP POLICY IF EXISTS "Allow authenticated users to update offer letters" ON "offer-letters";

-- Create RLS policies
CREATE POLICY "Allow public read access" ON "offer-letters"
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access" ON "offer-letters"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access" ON "offer-letters"
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON "offer-letters"
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_offer_letters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_offer_letters_updated_at ON "offer-letters";
CREATE TRIGGER update_offer_letters_updated_at
  BEFORE UPDATE ON "offer-letters"
  FOR EACH ROW
  EXECUTE FUNCTION update_offer_letters_updated_at();

-- Verify table was created
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'offer-letters'
ORDER BY ordinal_position;


