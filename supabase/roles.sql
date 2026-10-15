-- Adds the Viewer role: sees everyone's time, cannot invite or remove people.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
alter table public.allowed_emails add column if not exists can_view_all boolean not null default false;
alter table public.profiles       add column if not exists can_view_all boolean not null default false;

create or replace function public.can_view_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (is_admin or can_view_all) and active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.allowed_emails;
begin
  select * into inv from public.allowed_emails where email = lower(new.email);
  if not found then
    raise exception 'This email has not been invited to the timesheet.';
  end if;
  insert into public.profiles (id, email, full_name, is_admin, can_view_all)
  values (new.id, lower(new.email), inv.full_name, inv.is_admin, inv.can_view_all)
  on conflict (id) do update set active = true;
  return new;
end;
$$;

drop policy if exists "read own profile, admins read all" on public.profiles;
create policy "read own profile, admins read all" on public.profiles
  for select using (id = auth.uid() or public.can_view_all());

drop policy if exists "read own entries, admins read all" on public.entries;
create policy "read own entries, admins read all" on public.entries
  for select using ((user_id = auth.uid() and public.is_active()) or public.can_view_all());
