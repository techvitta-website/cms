-- Enforce one experience letter per candidate ("experience must be unique").
-- Partial unique index so multiple NULL candidate_id rows (manual, unlinked
-- uploads) remain allowed, but each real candidate can have at most one.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_experience_letters_candidate
ON "experience-letters" (candidate_id)
WHERE candidate_id IS NOT NULL;
