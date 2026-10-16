-- Team-wide settings: work week, weekends, and default access. Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.app_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "everyone reads settings" on public.app_settings;
create policy "everyone reads settings" on public.app_settings for select using (public.is_active());
drop policy if exists "admins change settings" on public.app_settings;
create policy "admins change settings" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());

-- Default allowed locations now come from Settings.
create or replace function public.location_allowed(loc text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when loc in ('Annual leave','Sick leave','Public holiday','Unpaid leave') then true
    else coalesce((
      select case
        when p.settings ? 'locations' then (p.settings->'locations') ? loc
        when p.is_admin then true
        when (select data ? 'defaults' from public.app_settings where id = 1)
          then coalesce((select (data->'defaults'->'locations') ? loc from public.app_settings where id = 1), false)
        else loc in ('Office','Break')
      end
      from public.profiles p where p.id = auth.uid()
    ), false)
  end;
$$;
