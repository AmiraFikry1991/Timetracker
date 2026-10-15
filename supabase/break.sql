-- Adds the Break type. Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
alter table public.entries drop constraint if exists entries_location_check;
alter table public.entries add constraint entries_location_check
  check (location in ('Office','Home','Field work','Break','Annual leave','Sick leave','Public holiday','Unpaid leave'));
