ATS Processor - Supabase Edge Function

What this delivers
- Edge Function supabase/functions/ats-processor:
  - GET /health → { ok, bucketExists, unprocessedCount }
  - POST /process-unprocessed → batch-scan resumes/resumes-private and process PDFs
  - POST /event → event-style handler for storage upload events
- Robust PDF download and text extraction with pdfjs (Deno-compatible) and fallback
- AI extraction via OpenAI (gpt-4o-mini) when OPENAI_API_KEY exists; heuristics otherwise
- Upserts into candidates, matches, resume_scores; activity logging to activity_logs
- Idempotency: skips files already present in resume_scores.file_name

Environment variables (configure securely in project settings)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (server-only)
- SUPABASE_ANON_KEY (optional, unused in function)
- OPENAI_API_KEY (optional)

Required tables (names align with your app)
- candidates: id uuid pk, full_name text, email text unique, resume_url text, resume_text text, skills jsonb, experience_years int, education text, resume_processed boolean
- jobs: id uuid pk, job_title text, description text, required_skills jsonb, experience_required int
- matches: id uuid pk, candidate_id uuid fk, job_id uuid fk, match_score int, remarks text
- resume_scores: id uuid pk, file_name text unique, name text, skills jsonb, score int, created_at/updated_at timestamptz
- activity_logs: id uuid pk, level text, action text, details jsonb, created_at timestamptz default now()

Storage policies (private buckets)
Run supabase/fix_storage_policies.sql to ensure service role access to resumes-private; keep anon access disabled for privacy.

Deploy
1) Install Supabase CLI and login
2) From repo root:
   supabase functions deploy ats-processor
3) Set env vars for the function:
   supabase secrets set --env-file .env

Test - health
curl -s "$(supabase functions list | awk '/ats-processor/ {print $3}')/health"

Test - batch processing
curl -s -X POST "$(supabase functions list | awk '/ats-processor/ {print $3}')/process-unprocessed"

Storage event hookup (optional)
- In Supabase Dashboard → Storage → Triggers (or Edge Functions hooks), configure an HTTP webhook to POST to /event on object.create for buckets: resumes, resumes-private.

Verify data
- candidates updated (resume_text length > 0, resume_processed true)
- matches inserted per job (highest score near skills overlap)
- resume_scores contains one row per file with highest score
- activity_logs contains processing entries

Notes
- If OpenAI key is missing or rate-limited, the function falls back to deterministic heuristics.
- For very large PDFs, the function truncates text for AI but keeps local scoring full-text.






