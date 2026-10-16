-- TaDay catch-up update: brings any database fully up to date. Safe to run more than once.
-- Includes: To Do lists, Viewer role, team to-do visibility, Break, permissions, location enforcement, Settings.

-- ===== todos =====
create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) <= 200),
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists todos_user on public.todos(user_id, done);

alter table public.todos enable row level security;
drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos
  for all using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid() and public.is_active());

do $$
begin
  begin alter publication supabase_realtime add table public.todos; exception when duplicate_object then null; end;
end $$;

-- ===== roles =====
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

-- ===== todos-visibility =====
drop policy if exists "own todos" on public.todos;
drop policy if exists "read own todos, viewers read all" on public.todos;
create policy "read own todos, viewers read all" on public.todos
  for select using ((user_id = auth.uid() and public.is_active()) or public.can_view_all());
drop policy if exists "add own todos" on public.todos;
create policy "add own todos" on public.todos
  for insert with check (user_id = auth.uid() and public.is_active());
drop policy if exists "change own todos" on public.todos;
create policy "change own todos" on public.todos
  for update using (user_id = auth.uid() and public.is_active()) with check (user_id = auth.uid());
drop policy if exists "delete own todos" on public.todos;
create policy "delete own todos" on public.todos
  for delete using (user_id = auth.uid() and public.is_active());

-- ===== break =====
alter table public.entries drop constraint if exists entries_location_check;
alter table public.entries add constraint entries_location_check
  check (location in ('Office','Home','Field work','Break','Annual leave','Sick leave','Public holiday','Unpaid leave'));

-- ===== permissions =====
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

-- ===== enforce-locations =====
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

-- ===== settings =====
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

