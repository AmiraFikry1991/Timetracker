-- To Do and Ta-da lists. Run once in Supabase: SQL Editor > New query > paste > Run.
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
