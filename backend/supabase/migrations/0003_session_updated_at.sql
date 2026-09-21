-- Session freshness for listing/sorting. Trigger keeps updated_at
-- current on every new message. Apply via Supabase SQL editor or CLI.
-- The app never manages schema.

alter table sessions
  add column if not exists updated_at timestamptz not null default now();

create or replace function touch_session_updated_at()
returns trigger as $$
begin
  update sessions set updated_at = now() where id = new.session_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists messages_touch_session on messages;

create trigger messages_touch_session
  after insert on messages
  for each row execute function touch_session_updated_at();
