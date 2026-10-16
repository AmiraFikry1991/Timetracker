-- Lets admins set a password for a team member who has signed in at least once.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
create or replace function public.admin_set_password(target_email text, new_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can set passwords for other people.';
  end if;
  if length(new_password) < 8 then
    raise exception 'Use at least 8 characters.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where lower(email) = lower(target_email);
  if not found then
    raise exception 'That person has not signed in yet. Ask them to sign in once with their invite email first.';
  end if;
end;
$$;
revoke all on function public.admin_set_password(text, text) from public, anon;
grant execute on function public.admin_set_password(text, text) to authenticated;
