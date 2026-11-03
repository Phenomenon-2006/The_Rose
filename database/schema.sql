-- Midnight Rose — database schema for Supabase (PostgreSQL)
-- Paste this whole file into: Supabase Dashboard > SQL Editor > New query > Run.
-- It is safe to run more than once.

-- 1) Rooms --------------------------------------------------------------------
create table if not exists public.rooms (
  id    text primary key,
  label text not null
);

insert into public.rooms (id, label) values
  ('main', 'Midnight Rose'),
  ('test', 'Test room')
on conflict (id) do nothing;

-- 2) Messages -----------------------------------------------------------------
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  room_id     text        not null references public.rooms (id),
  sender_key  text        not null check (sender_key in ('a', 'b', 'test')),
  sender_name text        not null check (char_length(sender_name) between 1 and 40),
  content     text        not null check (char_length(content) between 1 and 2000),
  created_at  timestamptz not null default now(),
  -- The database itself refuses mixing: test sender only in the test room,
  -- the two main participants only in the main room.
  constraint messages_room_sender_pairing check (
    (room_id = 'main' and sender_key in ('a', 'b')) or
    (room_id = 'test' and sender_key = 'test')
  )
);

create index if not exists messages_room_id_id_idx on public.messages (room_id, id);

-- 3) Failed-login log (used for rate limiting) ---------------------------------
create table if not exists public.login_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_time_idx on public.login_attempts (created_at);
create index if not exists login_attempts_ip_idx   on public.login_attempts (ip_hash, created_at);

-- 4) Row Level Security -------------------------------------------------------
-- RLS ON + NO policies = nobody using the public (anon) or logged-in (authenticated) keys can
-- read or write anything. Only the server (using the secret service-role key, which bypasses RLS)
-- can touch these tables, and the server decides which room a person may use.
alter table public.rooms          enable row level security;
alter table public.messages       enable row level security;
alter table public.login_attempts enable row level security;

-- Belt and braces: also remove table privileges from the public-facing roles.
revoke all on public.rooms          from anon, authenticated;
revoke all on public.messages       from anon, authenticated;
revoke all on public.login_attempts from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
