-- Permanent delete on the Archived Candidates page now also removes the
-- candidate's resume PDF from storage (otherwise the Dashboard's storage merge
-- resurrects the person as a fresh "storage-only" row from the leftover file).
-- resumes-private already has an authenticated DELETE policy; the legacy
-- `resumes` bucket had none, so removals there silently deleted nothing.
CREATE POLICY "auth delete resumes objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'resumes');
