-- ============================================================================
-- 020_add_sourced_leads.sql
-- ADDITIVE ONLY. New table `sourced_leads` for the public-web intern-sourcing
-- feature (GitHub profiles + public resume/portfolio links). Does NOT touch
-- candidates, intern_batches, or any existing object. Safe to run repeatedly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sourced_leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT,
  kind         TEXT,                 -- 'github' | 'web' | 'linkedin' | 'portfolio'
  source       TEXT,                 -- human label of where it came from
  url          TEXT NOT NULL,        -- public profile / resume / page URL
  snippet      TEXT,                 -- short description / search snippet
  location     TEXT,
  college      TEXT,
  skills       TEXT[],
  query        TEXT,                 -- the search that surfaced it
  status       TEXT NOT NULL DEFAULT 'New',   -- New | Saved | Contacted | Imported | Dismissed
  batch_tag    TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- De-dupe on URL so re-running a search doesn't pile up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS sourced_leads_url_key ON sourced_leads (url);
CREATE INDEX IF NOT EXISTS sourced_leads_status_idx ON sourced_leads (status);
CREATE INDEX IF NOT EXISTS sourced_leads_created_idx ON sourced_leads (created_at DESC);

ALTER TABLE sourced_leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sourced_leads'
      AND policyname = 'authenticated_manage_sourced_leads'
  ) THEN
    CREATE POLICY authenticated_manage_sourced_leads
      ON sourced_leads
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
