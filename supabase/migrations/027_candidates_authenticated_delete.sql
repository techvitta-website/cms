-- Permanent delete from the Archived Candidates page needs a DELETE RLS policy.
-- The candidates table had INSERT/SELECT/UPDATE policies but no DELETE policy,
-- so with RLS enabled every delete silently removed 0 rows (no error) — the
-- candidate never actually left the database.
--
-- Restrict deletes to authenticated (logged-in HR). Child rows (interviews,
-- documents, offer/experience/rejection letters, etc.) are removed by the
-- existing FK ON DELETE CASCADE / SET NULL, which runs as the table owner and
-- bypasses RLS, so no child-table policies are required.
CREATE POLICY "candidates_authenticated_delete"
ON public.candidates
FOR DELETE
TO authenticated
USING (true);
