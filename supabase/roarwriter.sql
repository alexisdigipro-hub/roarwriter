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

-- ---------------------------------------------------------------------------------------------------------------
-- Collaborate (Alex, 24 Oct 2026): the owner shares a script with other people by email, each one able to edit or
-- only to read it. A share is kept by email, so someone without an account yet gets the script when they make
-- one with that email; nobody's account can be looked up through it. Only the owner shares, changes a role or
-- removes someone; anyone shared with can leave. The owner stays the owner whoever saves the script.
create table if not exists public.roarwriter_shares (
  script_id  uuid not null references public.roarwriter_scripts(id) on delete cascade,
  email      text not null check (email = lower(email) and email like '%@%'),
  role       text not null default 'edit' check (role in ('edit', 'view')),
  added_by   uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (script_id, email)
);
create index if not exists roarwriter_shares_email on public.roarwriter_shares (email);

-- what the person signed in may do with a script: 'owner', 'edit', 'view' or nothing
create or replace function public.roarwriter_role(p_script uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from roarwriter_scripts s where s.id = p_script and s.owner = auth.uid()) then 'owner'
    else (select sh.role from roarwriter_shares sh where sh.script_id = p_script and sh.email = lower(coalesce(auth.email(), '')) limit 1)
  end
$$;
revoke all on function public.roarwriter_role(uuid) from public, anon;
grant execute on function public.roarwriter_role(uuid) to authenticated;

-- the scripts: everyone it is shared with reads it, editors change it, only the owner makes or deletes one
drop policy if exists roarwriter_scripts_own on public.roarwriter_scripts;
drop policy if exists roarwriter_scripts_read on public.roarwriter_scripts;
drop policy if exists roarwriter_scripts_add on public.roarwriter_scripts;
drop policy if exists roarwriter_scripts_change on public.roarwriter_scripts;
drop policy if exists roarwriter_scripts_delete on public.roarwriter_scripts;
create policy roarwriter_scripts_read on public.roarwriter_scripts for select to authenticated
  using (owner = (select auth.uid()) or public.roarwriter_role(id) is not null);
create policy roarwriter_scripts_add on public.roarwriter_scripts for insert to authenticated
  with check (owner = (select auth.uid()));
create policy roarwriter_scripts_change on public.roarwriter_scripts for update to authenticated
  using (public.roarwriter_role(id) in ('owner', 'edit')) with check (public.roarwriter_role(id) in ('owner', 'edit'));
create policy roarwriter_scripts_delete on public.roarwriter_scripts for delete to authenticated
  using (owner = (select auth.uid()));

-- a new script belongs to whoever makes it; a saved one keeps its owner; the time is the server's
create or replace function public.roarwriter_own() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.owner := old.owner; new.created_at := old.created_at;
  else new.owner := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;

alter table public.roarwriter_shares enable row level security;
drop policy if exists roarwriter_shares_read on public.roarwriter_shares;
drop policy if exists roarwriter_shares_owner on public.roarwriter_shares;
drop policy if exists roarwriter_shares_leave on public.roarwriter_shares;
create policy roarwriter_shares_read on public.roarwriter_shares for select to authenticated
  using (email = lower(coalesce(auth.email(), '')) or public.roarwriter_role(script_id) = 'owner');
create policy roarwriter_shares_owner on public.roarwriter_shares for all to authenticated
  using (public.roarwriter_role(script_id) = 'owner') with check (public.roarwriter_role(script_id) = 'owner');
create policy roarwriter_shares_leave on public.roarwriter_shares for delete to authenticated
  using (email = lower(coalesce(auth.email(), '')));
revoke all on public.roarwriter_shares from anon;
grant select, insert, update, delete on public.roarwriter_shares to authenticated;

-- the list of scripts with who owns each and what the person may do (the owner's name for shared ones)
create or replace function public.roarwriter_list() returns table (id uuid, title text, meta jsonb, updated_at timestamptz, role text, owner_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.meta, s.updated_at,
         case when s.owner = auth.uid() then 'owner' else sh.role end,
         case when s.owner = auth.uid() then '' else coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email) end
  from roarwriter_scripts s
  left join roarwriter_shares sh on sh.script_id = s.id and sh.email = lower(coalesce(auth.email(), ''))
  left join auth.users u on u.id = s.owner
  where s.owner = auth.uid() or sh.email is not null
  order by s.updated_at desc
$$;
revoke all on function public.roarwriter_list() from public, anon;
grant execute on function public.roarwriter_list() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Versions (Alex, 25 Oct 2026): named copies of a script (and one a day on their own), for everyone it is shared
-- with; editors add them, the owner or whoever made one deletes it.
create table if not exists public.roarwriter_versions (
  id         uuid primary key default gen_random_uuid(),
  script_id  uuid not null references public.roarwriter_scripts(id) on delete cascade,
  name       text not null default '',
  data       jsonb not null,
  meta       jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  by_name    text not null default '',
  created_at timestamptz not null default now(),
  constraint roarwriter_versions_size check (octet_length(data::text) <= 5000000)
);
create index if not exists roarwriter_versions_script on public.roarwriter_versions (script_id, created_at desc);
alter table public.roarwriter_versions enable row level security;
drop policy if exists roarwriter_versions_read on public.roarwriter_versions;
drop policy if exists roarwriter_versions_add on public.roarwriter_versions;
drop policy if exists roarwriter_versions_delete on public.roarwriter_versions;
create policy roarwriter_versions_read on public.roarwriter_versions for select to authenticated
  using (public.roarwriter_role(script_id) is not null);
create policy roarwriter_versions_add on public.roarwriter_versions for insert to authenticated
  with check (public.roarwriter_role(script_id) in ('owner', 'edit') and created_by = (select auth.uid()));
create policy roarwriter_versions_delete on public.roarwriter_versions for delete to authenticated
  using (public.roarwriter_role(script_id) = 'owner' or created_by = (select auth.uid()));
revoke all on public.roarwriter_versions from anon;
grant select, insert, delete on public.roarwriter_versions to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Who is in the script right now (Collaborate): each person's line, a few seconds old at most; the time is the server's.
create table if not exists public.roarwriter_presence (
  script_id uuid not null references public.roarwriter_scripts(id) on delete cascade,
  user_id   uuid not null default auth.uid(),
  name      text not null default '',
  email     text not null default '',
  el_id     text not null default '',
  at        timestamptz not null default now(),
  primary key (script_id, user_id)
);
alter table public.roarwriter_presence enable row level security;
drop policy if exists roarwriter_presence_read on public.roarwriter_presence;
drop policy if exists roarwriter_presence_mine on public.roarwriter_presence;
create policy roarwriter_presence_read on public.roarwriter_presence for select to authenticated
  using (public.roarwriter_role(script_id) is not null);
create policy roarwriter_presence_mine on public.roarwriter_presence for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.roarwriter_role(script_id) is not null);
revoke all on public.roarwriter_presence from anon;
grant select, insert, update, delete on public.roarwriter_presence to authenticated;
create or replace function public.roarwriter_presence_at() returns trigger language plpgsql set search_path = public as $$
begin new.at := now(); new.user_id := auth.uid(); return new; end $$;
drop trigger if exists roarwriter_presence_at on public.roarwriter_presence;
create trigger roarwriter_presence_at before insert or update on public.roarwriter_presence
  for each row execute function public.roarwriter_presence_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Storyboard pictures: a private bucket, a folder per script; the people a script is shared with see its pictures,
-- its editors add and remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roarwriter-boards', 'roarwriter-boards', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create or replace function public.roarwriter_role_path(p text) returns text
language sql stable security definer set search_path = public as $$
  select case when split_part(p, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.roarwriter_role(split_part(p, '/', 1)::uuid) end
$$;
revoke all on function public.roarwriter_role_path(text) from public, anon;
grant execute on function public.roarwriter_role_path(text) to authenticated;
drop policy if exists roarwriter_boards_read on storage.objects;
drop policy if exists roarwriter_boards_add on storage.objects;
drop policy if exists roarwriter_boards_change on storage.objects;
drop policy if exists roarwriter_boards_delete on storage.objects;
create policy roarwriter_boards_read on storage.objects for select to authenticated
  using (bucket_id = 'roarwriter-boards' and public.roarwriter_role_path(name) is not null);
create policy roarwriter_boards_add on storage.objects for insert to authenticated
  with check (bucket_id = 'roarwriter-boards' and public.roarwriter_role_path(name) in ('owner', 'edit'));
create policy roarwriter_boards_change on storage.objects for update to authenticated
  using (bucket_id = 'roarwriter-boards' and public.roarwriter_role_path(name) in ('owner', 'edit'));
create policy roarwriter_boards_delete on storage.objects for delete to authenticated
  using (bucket_id = 'roarwriter-boards' and public.roarwriter_role_path(name) in ('owner', 'edit'));
