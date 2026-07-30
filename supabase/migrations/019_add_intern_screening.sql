-- ============================================================================
-- 019_add_intern_screening.sql
-- ADDITIVE ONLY. Adds intern-screening fields to `candidates` and a new
-- `intern_batches` table. Nothing here drops, renames, or alters an existing
-- column, policy, function, or table. Safe to run more than once.
-- Every existing CMS feature keeps working exactly as before.
-- ============================================================================

-- --- New columns on candidates (all IF NOT EXISTS, all nullable) -------------
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS college             TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS degree              TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS branch              TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS graduation_year     INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cgpa                NUMERIC;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS projects            TEXT[];
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS certifications      TEXT[];
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS batch_tag           TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_portal       TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_score     NUMERIC;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_tier      TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_rationale TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS intern_flags        TEXT[];
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_at         TIMESTAMPTZ;

-- Helpful indexes for the review queue (safe/no-op if they already exist).
CREATE INDEX IF NOT EXISTS candidates_batch_tag_idx      ON candidates (batch_tag);
CREATE INDEX IF NOT EXISTS candidates_screening_score_idx ON candidates (screening_score DESC);

-- --- New table: intern_batches ----------------------------------------------
CREATE TABLE IF NOT EXISTS intern_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  source_portal  TEXT,
  target_role    TEXT,
  target_job_id  TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE intern_batches ENABLE ROW LEVEL SECURITY;

-- Authenticated staff (same trust boundary as the rest of the CMS) can manage
-- batches. Created with a guard so re-running the file does not error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'intern_batches'
      AND policyname = 'authenticated_manage_intern_batches'
  ) THEN
    CREATE POLICY authenticated_manage_intern_batches
      ON intern_batches
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
