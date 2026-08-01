-- Track the resume request/reminder cycle for candidates without a resume:
-- how many times HR has emailed them an upload link and when the last one
-- went out. After 3 reminders with no upload, HR archives the candidate.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS resume_request_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resume_requested_at timestamptz;
