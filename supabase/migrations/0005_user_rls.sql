-- Per-user isolation for the on-device app (ADR-0010).
-- Apply via Supabase SQL editor or CLI. The app never manages schema.
--
-- Sessions gain a user_id (anonymous auth at first, upgradeable to email
-- later); RLS restricts every row to its owner. Messages stay user-free —
-- their policies join through the parent session. Pre-migration rows have
-- NULL user_id and become invisible once RLS is enabled; backfill or drop
-- them when applying this to an existing project.

alter table sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table sessions enable row level security;
alter table messages enable row level security;

drop policy if exists "users own sessions" on sessions;
create policy "users own sessions" on sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users own messages" on messages;
create policy "users own messages" on messages
  for all
  using (
    exists (
      select 1 from sessions
      where sessions.id = messages.session_id
      and sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions
      where sessions.id = messages.session_id
      and sessions.user_id = auth.uid()
    )
  );
