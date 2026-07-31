-- "Interview Scheduled" must mean an interview is actually booked. Candidates
-- advanced to the interview stage but without a booked interview record are
-- moved to the new intermediate status "Interview Pending". Going forward the
-- app sets "Interview Pending" on advancement and only flips a candidate to
-- "Interview Scheduled" when their individual slot is booked.
UPDATE public.candidates c
SET status = 'Interview Pending'
WHERE c.status = 'Interview Scheduled'
  AND NOT EXISTS (SELECT 1 FROM public.interviews i WHERE i.candidate_id = c.id);
