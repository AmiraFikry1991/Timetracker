-- Amira's Timesheet Tracker: database setup
-- Run this once in Supabase: SQL Editor > New query > paste everything > Run.
-- It is safe to run again later; it will not delete any data.

create extension if not exists pgcrypto;

-- People who are allowed to sign in. Only the admin can add or remove rows.
create table if not exists public.allowed_emails (
  email       text primary key,
  full_name   text,
  is_admin    boolean not null default false,
  invited_at  timestamptz not null default now()
);

-- One row per person who has signed in at least once.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Time entries.
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  date        date not null,
  task        text not null check (char_length(task) <= 120),
  notes       text check (char_length(notes) <= 2000),
  project     text check (char_length(project) <= 80),
  location    text not null default 'Office'
              check (location in ('Office','Home','Field work','Annual leave','Sick leave','Public holiday','Unpaid leave')),
  start_time  text,
  end_time    text,
  hours       numeric(5,2) not null default 0 check (hours >= 0 and hours <= 24),
  created_at  timestamptz not null default now()
);
create index if not exists entries_user_date on public.entries(user_id, date);
create index if not exists entries_date on public.entries(date);

-- A running timer, at most one per person.
create table if not exists public.timers (
  user_id     uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  started_at  timestamptz not null,
  task        text,
  project     text,
  location    text,
  notes       text
);

-- Helpers used by the access rules below.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

-- Only invited emails can create an account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.allowed_emails;
begin
  select * into inv from public.allowed_emails where email = lower(new.email);
  if not found then
    raise exception 'This email has not been invited to the timesheet.';
  end if;
  insert into public.profiles (id, email, full_name, is_admin)
  values (new.id, lower(new.email), inv.full_name, inv.is_admin)
  on conflict (id) do update set active = true;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Access rules: each person sees and edits only their own time; the admin sees everyone.
alter table public.allowed_emails enable row level security;
alter table public.profiles       enable row level security;
alter table public.entries        enable row level security;
alter table public.timers         enable row level security;

drop policy if exists "admins manage invites" on public.allowed_emails;
create policy "admins manage invites" on public.allowed_emails
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own profile, admins read all" on public.profiles;
create policy "read own profile, admins read all" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own entries, admins read all" on public.entries;
create policy "read own entries, admins read all" on public.entries
  for select using ((user_id = auth.uid() and public.is_active()) or public.is_admin());

drop policy if exists "add own entries" on public.entries;
create policy "add own entries" on public.entries
  for insert with check (user_id = auth.uid() and public.is_active());

drop policy if exists "change own entries" on public.entries;
create policy "change own entries" on public.entries
  for update using (user_id = auth.uid() and public.is_active()) with check (user_id = auth.uid());

drop policy if exists "delete own entries" on public.entries;
create policy "delete own entries" on public.entries
  for delete using (user_id = auth.uid() and public.is_active());

drop policy if exists "own timer" on public.timers;
create policy "own timer" on public.timers
  for all using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid() and public.is_active());

-- Live updates between devices.
do $$
begin
  begin alter publication supabase_realtime add table public.entries; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.timers;  exception when duplicate_object then null; end;
end $$;

-- To Do and Ta-da lists.
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

-- You, as the admin. Change the email here if you want to sign in with a different one.
insert into public.allowed_emails (email, full_name, is_admin)
values ('amira.fikry.mahmoud@gmail.com', 'Amira Fikry', true)
on conflict (email) do update set is_admin = true;
