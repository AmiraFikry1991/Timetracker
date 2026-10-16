-- Per-person permissions (where they can log time, which pages they see, their usual day).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
alter table public.allowed_emails add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.profiles       add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.allowed_emails;
begin
  select * into inv from public.allowed_emails where email = lower(new.email);
  if not found then
    raise exception 'This email has not been invited to the timesheet.';
  end if;
  insert into public.profiles (id, email, full_name, is_admin, can_view_all, settings)
  values (new.id, lower(new.email), inv.full_name, inv.is_admin, inv.can_view_all, coalesce(inv.settings, '{}'::jsonb))
  on conflict (id) do update set active = true;
  return new;
end;
$$;
