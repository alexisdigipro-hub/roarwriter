-- RoarWriter (The Mad Lions Lab, Oct 2026): the scripts, in RoarMe's Supabase project (bzmjhbnwhdwmncxkqkdl),
-- because RoarWriter signs in with RoarMe accounts. Only its own table, roarwriter_scripts; nothing of RoarMe's
-- is read or written. Each person sees and changes only their own scripts. Safe to run again.

create table if not exists public.roarwriter_scripts (
  id         uuid primary key,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default '',
  meta       jsonb not null default '{}'::jsonb,   -- author, pages, scenes: what the list shows
  data       jsonb not null default '{}'::jsonb,   -- the whole script (title page, settings, elements)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roarwriter_scripts_size check (octet_length(data::text) <= 5000000)
);
create index if not exists roarwriter_scripts_owner on public.roarwriter_scripts (owner, updated_at desc);

alter table public.roarwriter_scripts enable row level security;
drop policy if exists roarwriter_scripts_own on public.roarwriter_scripts;
create policy roarwriter_scripts_own on public.roarwriter_scripts
  for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

revoke all on public.roarwriter_scripts from anon;
grant select, insert, update, delete on public.roarwriter_scripts to authenticated;

-- the owner is always the person signed in, whatever a request sends
create or replace function public.roarwriter_own() returns trigger language plpgsql set search_path = public as $$
begin
  new.owner := auth.uid();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists roarwriter_own on public.roarwriter_scripts;
create trigger roarwriter_own before insert or update on public.roarwriter_scripts
  for each row execute function public.roarwriter_own();
