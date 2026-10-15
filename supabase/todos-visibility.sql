-- Lets admins and Viewers see their team's To Do and Ta-da! lists (read-only).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Needs roles.sql to have been run first.
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
