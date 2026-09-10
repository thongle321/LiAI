-- Slice 4: durable conversation storage.
-- Apply via Supabase SQL editor or CLI. The app never manages schema.
-- Sessions use TEXT ids to match the existing uuid4-hex session ids.

create table if not exists sessions (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  session_id text not null references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_lookup_idx
  on messages (session_id, created_at, id);
