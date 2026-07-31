-- Auto-archive candidates whose status is 'Rejected' or 'Cancelled'.
-- Such candidates should leave the active dashboard and appear on the
-- Archived Candidates page. A trigger enforces this invariant no matter which
-- code path sets the status (feedback, rejection letter, manual dropdown, etc.).

CREATE OR REPLACE FUNCTION public.auto_archive_closed_candidates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('Rejected', 'Cancelled') THEN
    NEW.is_archived := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_archive_closed_candidates ON public.candidates;

CREATE TRIGGER trg_auto_archive_closed_candidates
BEFORE INSERT OR UPDATE OF status ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.auto_archive_closed_candidates();

-- Backfill existing rejected / cancelled candidates into the archive.
UPDATE public.candidates
SET is_archived = true
WHERE status IN ('Rejected', 'Cancelled')
  AND is_archived IS DISTINCT FROM true;
