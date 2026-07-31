-- 021_add_foreign_key_indexes.sql
-- ADDITIVE performance hardening. Supabase's performance advisor flagged six
-- foreign keys with no covering index. Without an index on the referencing
-- column, every UPDATE/DELETE on the parent table (and every join/filter on the
-- FK) does a sequential scan. These indexes are purely additive: they change no
-- data, no business logic, and no existing feature — they only make the existing
-- queries faster. IF NOT EXISTS keeps this migration safe to re-run.

-- candidates.job_id -> jobs.id
CREATE INDEX IF NOT EXISTS idx_candidates_job_id
  ON public.candidates (job_id);

-- matches.job_id -> jobs.id
CREATE INDEX IF NOT EXISTS idx_matches_job_id
  ON public.matches (job_id);

-- shortlist_records.shortlisted_by -> auth.users.id
CREATE INDEX IF NOT EXISTS idx_shortlist_records_shortlisted_by
  ON public.shortlist_records (shortlisted_by);

-- document_upload_tokens.requested_by -> hr_users.id
CREATE INDEX IF NOT EXISTS idx_document_upload_tokens_requested_by
  ON public.document_upload_tokens (requested_by);

-- candidate_documents.verified_by -> hr_users.id
CREATE INDEX IF NOT EXISTS idx_candidate_documents_verified_by
  ON public.candidate_documents (verified_by);

-- document_requests.requested_by -> hr_users.id
CREATE INDEX IF NOT EXISTS idx_document_requests_requested_by
  ON public.document_requests (requested_by);
