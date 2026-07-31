-- 023_create_rejection_letters.sql
-- ADDITIVE. History table for generated rejection letters, mirroring the
-- experience-letters / offer-letters pattern. RLS enabled; authenticated HR app
-- has full access; anon has none.

CREATE TABLE IF NOT EXISTS public.rejection_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  rejection_letter_url text,
  file_name text,
  file_type text DEFAULT 'application/pdf',
  email text,
  email_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rejection_letters_candidate_id
  ON public.rejection_letters (candidate_id);

ALTER TABLE public.rejection_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rejection_letters_authenticated_all ON public.rejection_letters;
CREATE POLICY rejection_letters_authenticated_all ON public.rejection_letters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
