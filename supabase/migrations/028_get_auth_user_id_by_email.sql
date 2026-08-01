-- The delete-hr-user edge function must resolve a user's auth.users id from
-- their email. In this project hr_users.id does NOT always equal
-- auth.users.id (roles are keyed by email, and several accounts were created
-- such that the two ids diverge). PostgREST does not expose the `auth` schema,
-- so we provide a SECURITY DEFINER helper that the service role can call to map
-- an email to its auth user id.
--
-- Locked down to the service role only (edge functions), so it is not a
-- general email->id enumeration endpoint for logged-in users.
create or replace function public.get_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.get_auth_user_id_by_email(text) from public;
revoke all on function public.get_auth_user_id_by_email(text) from anon;
revoke all on function public.get_auth_user_id_by_email(text) from authenticated;
grant execute on function public.get_auth_user_id_by_email(text) to service_role;
