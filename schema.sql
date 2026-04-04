-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- BOXES
create table boxes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  created_at  timestamptz default now()
);

alter table boxes enable row level security;

create policy "users own their boxes"
  on boxes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- TRANSACTIONS
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid references boxes(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  amount      numeric(12, 2) not null,
  description text,
  created_at  timestamptz default now()
);

alter table transactions enable row level security;

create policy "users own their transactions"
  on transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes for performance
create index on transactions(box_id, created_at desc);
create index on boxes(user_id, created_at);
