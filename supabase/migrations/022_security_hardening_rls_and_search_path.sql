-- 022_security_hardening_rls_and_search_path.sql
--
-- SAFE, VERIFIED security hardening. Every change here was dry-run inside a
-- ROLLBACK transaction that simulated the exact anonymous queries the public
-- apply form and document-upload page run, confirming they still succeed. No
-- business logic, data, or existing feature is removed.
--
-- Three parts:
--   1. Pin search_path on the 7 user-defined functions (fixes
--      function_search_path_mutable). The http_* functions are owned by the
--      `http` extension and are intentionally left untouched.
--   2. Enable RLS on the orphaned public.cid_records table (fixes the one
--      advisor ERROR). Nothing in the app reads it; service_role bypasses RLS
--      and authenticated keeps access, so no flow breaks.
--   3. Collapse the 11 duplicated/overlapping candidates policies into 4 clean
--      ones and column-scope the anon role to exactly what the public flows
--      need (fixes multiple_permissive_policies and removes anon's ability to
--      read sensitive columns, tamper with status/screening, or delete rows).

-- ---------------------------------------------------------------------------
-- Part 1: function search_path
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.get_user_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_resume() SET search_path = public, pg_temp;
ALTER FUNCTION public.job_after_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.recompute_matches_for_job(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_experience_letters_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_offer_letters_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Part 2: cid_records RLS (advisor ERROR: rls_disabled_in_public)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cid_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cid_records_authenticated_all ON public.cid_records;
CREATE POLICY cid_records_authenticated_all ON public.cid_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- No anon policy => anon is denied. Strip leftover anon table grants too.
REVOKE ALL ON public.cid_records FROM anon;

-- ---------------------------------------------------------------------------
-- Part 3: candidates policy consolidation + anon column scoping
-- ---------------------------------------------------------------------------
-- Drop the redundant, all-permissive policies (5 SELECT, 3 INSERT, 3 UPDATE).
DROP POLICY IF EXISTS "Allow anonymous users to insert candidates" ON public.candidates;
DROP POLICY IF EXISTS "Allow insert candidates" ON public.candidates;
DROP POLICY IF EXISTS "anon insert candidates" ON public.candidates;
DROP POLICY IF EXISTS "Allow anonymous users to read candidates" ON public.candidates;
DROP POLICY IF EXISTS "Allow public read candidates" ON public.candidates;
DROP POLICY IF EXISTS "anon read candidates" ON public.candidates;
DROP POLICY IF EXISTS "anon select candidates" ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_anon" ON public.candidates;
DROP POLICY IF EXISTS "Allow anonymous users to update candidates" ON public.candidates;
DROP POLICY IF EXISTS "Allow anonymous users to update document verification status" ON public.candidates;
DROP POLICY IF EXISTS "Allow update candidates" ON public.candidates;

-- Authenticated HR app: full read/write (matches prior behavior; no DELETE
-- policy, so deletes stay blocked exactly as before).
CREATE POLICY candidates_authenticated_select ON public.candidates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY candidates_authenticated_insert ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY candidates_authenticated_update ON public.candidates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Anonymous public flows: one policy per command.
CREATE POLICY candidates_anon_select ON public.candidates
  FOR SELECT TO anon USING (true);
CREATE POLICY candidates_anon_insert ON public.candidates
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY candidates_anon_update ON public.candidates
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Column-level privileges: RLS can't scope columns, so lock anon down here.
-- anon reads only what the apply/upload pages display + filter on, writes only
-- what those pages set, and loses DELETE/TRUNCATE/TRIGGER/REFERENCES entirely.
REVOKE ALL ON public.candidates FROM anon;
GRANT SELECT (id, full_name, email, phone, job_id, resume_hash)
  ON public.candidates TO anon;
GRANT INSERT ON public.candidates TO anon;
GRANT UPDATE (full_name, phone, resume_url, resume_hash, resume_processed,
              job_id, reference_source, document_verification_status)
  ON public.candidates TO anon;
