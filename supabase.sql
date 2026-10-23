-- Pegar esto en Supabase → SQL Editor → Run.
-- Crea la tabla del calendario y hace que cada usuario vea y edite solo lo suyo.

create table if not exists public.items (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  type        text not null default 'task' check (type in ('task', 'note')),
  title       text not null,
  notes       text not null default '',
  date        date,
  start_time  text,
  end_time    text,
  color       text not null default 'violeta',
  done        boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Tablero de tareas (Por hacer / En proceso / Hecha) y fecha de creación.
alter table public.items add column if not exists status text not null default 'todo';
alter table public.items add column if not exists created_at timestamptz not null default now();

create index if not exists items_user_idx on public.items (user_id);

alter table public.items enable row level security;

drop policy if exists "cada uno lo suyo" on public.items;
create policy "cada uno lo suyo" on public.items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
