-- ============================================================
-- encaixe — schema completo
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================
 
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
 
create index on transactions(box_id, created_at desc);
 
-- DEBTS
create table debts (
  id             uuid primary key default gen_random_uuid(),
  box_id         uuid references boxes(id) on delete cascade not null,
  user_id        uuid references auth.users(id) on delete cascade not null,
  amount         numeric(12, 2) not null,
  description    text,
  debtor         text,
  due_date       date,
  settled        boolean default false,
  settled_at     timestamptz,
  settled_tx_id  uuid references transactions(id) on delete set null,
  created_at     timestamptz default now()
);
 
alter table debts enable row level security;
 
create policy "users own their debts"
  on debts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
 
create index on debts(box_id, settled, created_at desc);