-- Session metadata for listing/management (Wave 1 chat).
-- Apply via Supabase SQL editor or CLI. The app never manages schema.

alter table sessions
  add column if not exists title text not null default '';

alter table sessions
  add column if not exists pinned boolean not null default false;
