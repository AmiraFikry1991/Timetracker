-- Enforces each person's allowed locations in the database (not just in the app).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Needs permissions.sql first. Safe to run again.
create or replace function public.location_allowed(loc text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when loc in ('Annual leave','Sick leave','Public holiday','Unpaid leave') then true
    else coalesce((
      select case
        when p.settings ? 'locations' then (p.settings->'locations') ? loc
        else loc in ('Office','Break') or p.is_admin
      end
      from public.profiles p where p.id = auth.uid()
    ), false)
  end;
$$;

drop policy if exists "add own entries" on public.entries;
create policy "add own entries" on public.entries
  for insert with check (user_id = auth.uid() and public.is_active() and public.location_allowed(location));

drop policy if exists "change own entries" on public.entries;
create policy "change own entries" on public.entries
  for update using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid() and public.location_allowed(location));
