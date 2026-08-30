-- Days the team publishes from the board, so a case authored in one browser can
-- be opened by anyone with the live URL.
--
-- This table holds dispatch scenarios: technicians, jobs, areas and a travel
-- table. No personal data, no credentials, nothing about a real person.

create table if not exists public.shared_days (
  id          text primary key,
  title       text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),

  -- A case is a few tens of kilobytes. Anything far larger is a mistake or an
  -- attempt to use the table as free storage.
  constraint shared_days_payload_size check (pg_column_size(payload) < 262144),
  constraint shared_days_id_shape check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint shared_days_title_len check (char_length(title) between 1 and 120)
);

alter table public.shared_days enable row level security;

-- The board is open to anyone with the URL, so reads and inserts are open too.
-- Update and delete are deliberately NOT granted: a published day can be added
-- to and read, but nobody holding only the publishable key can alter or remove
-- someone else's. Removing one is an owner action, done from the dashboard.
create policy "shared days are readable by anyone"
  on public.shared_days for select
  using (true);

create policy "anyone may publish a day"
  on public.shared_days for insert
  with check (true);

create index if not exists shared_days_created_at_idx
  on public.shared_days (created_at desc);
