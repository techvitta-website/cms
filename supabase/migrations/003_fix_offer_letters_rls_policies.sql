-- Fix RLS policies for offer-letters table
-- Run this SQL in Supabase Dashboard → SQL Editor to fix the permission error

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated users to read offer letters" ON "offer-letters";
DROP POLICY IF EXISTS "Allow authenticated users to insert offer letters" ON "offer-letters";
DROP POLICY IF EXISTS "Allow authenticated users to update offer letters" ON "offer-letters";

-- Create new policies that allow public access (for frontend with anon key)
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

-- Service role policy should already exist, but ensure it's there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'offer-letters' 
    AND policyname = 'Allow service role full access'
  ) THEN
    CREATE POLICY "Allow service role full access" ON "offer-letters"
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

