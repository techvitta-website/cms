-- Create offer-letters table for storing offer letter details
CREATE TABLE IF NOT EXISTS "offer-letters" (
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

-- Create index on candidate_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_offer_letters_candidate_id ON "offer-letters"(candidate_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_offer_letters_created_at ON "offer-letters"(created_at DESC);

-- Enable Row Level Security
ALTER TABLE "offer-letters" ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for viewing offer letters)
CREATE POLICY "Allow public read access" ON "offer-letters"
  FOR SELECT
  USING (true);

-- Allow public insert access (for creating offer letters from frontend)
CREATE POLICY "Allow public insert access" ON "offer-letters"
  FOR INSERT
  WITH CHECK (true);

-- Allow public update access (for updating offer letters)
CREATE POLICY "Allow public update access" ON "offer-letters"
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow service role full access (for Edge Functions)
CREATE POLICY "Allow service role full access" ON "offer-letters"
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_offer_letters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_offer_letters_updated_at
  BEFORE UPDATE ON "offer-letters"
  FOR EACH ROW
  EXECUTE FUNCTION update_offer_letters_updated_at();

