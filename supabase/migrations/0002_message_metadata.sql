-- Adapted from PocketPal messages table (minus pal features): per-turn
-- type + metadata JSON. Stores structural info only (e.g. tool names);
-- turn content stays text-only. Apply via Supabase SQL editor or CLI.
-- The app never manages schema.

alter table messages
  add column if not exists type text not null default 'text';

alter table messages
  add column if not exists metadata jsonb;
