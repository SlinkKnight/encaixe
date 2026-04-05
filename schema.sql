-- encaixe — schema completo
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- BOXES
create table boxes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  type       text not null default 'normal', -- 'normal' | 'debt'
  created_at timestamptz default now()
);

alter table boxes enable row level security;

create policy "users own their boxes"
  on boxes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on boxes(user_id, created_at);

-- TRANSACTIONS (handles both normal entries and debt entries via `pending`)
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid references boxes(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  amount      numeric(12, 2) not null,
  description text,
  -- debt fields (only used when pending = true)
  debtor      text,
  due_date    date,
  pending     boolean not null default false,  -- true = debt, not yet counted in balance
  settled     boolean not null default false,  -- true = debt was paid, now counts in balance
  created_at  timestamptz default now()
);

alter table transactions enable row level security;

create policy "users own their transactions"
  on transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on transactions(box_id, pending, created_at desc);
