-- Keystone Monitor schema.
--
-- Applied by hand in the Supabase SQL editor. Written to be re-runnable:
-- every statement is "if not exists", "or replace", or a drop-then-create,
-- so running the whole file again after a change is always safe.
--
-- WHO CAN DO WHAT
--   * Partners (rows in public.members) can READ everything below, and only
--     after passing two-factor (an aal2 session). RLS enforces both, so a
--     stolen password alone reads nothing.
--   * Nobody writes through the browser. Every write goes through the
--     service role, in a route handler or server action that has already
--     checked who is asking. There are deliberately no insert, update or
--     delete policies.
--   * Sync keys live in their own table with RLS on and no policies at all,
--     so not even a partner can read their hashes.

-- ---------------------------------------------------------------------------
-- 1. Members: who may sign in, and whether they can administer.
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'partner' check (role in ('admin', 'partner')),
  created_at   timestamptz not null default now()
);

alter table public.members enable row level security;

-- True for a member with a two-factor session. SECURITY DEFINER so the
-- policies below can call it without recursing into members' own policy.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

drop policy if exists "members read own row or all when verified" on public.members;
create policy "members read own row or all when verified"
  on public.members for select
  to authenticated
  using (user_id = auth.uid() or public.is_member());

-- ---------------------------------------------------------------------------
-- 2. Projects: V100 and Cycle Method. Adding a third is one insert.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "members read projects" on public.projects;
create policy "members read projects"
  on public.projects for select
  to authenticated
  using (public.is_member());

insert into public.projects (slug, name, sort) values
  ('v100', 'V100', 1),
  ('cycle-method', 'Cycle Method', 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Accounts: one row per external MT5 account.
--
-- account_number and server are blank until the EA's first sync, which
-- binds the row to that login. A later sync from a different login with
-- the same key is refused, so one key can never mix two accounts' deals.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id),
  label            text not null,
  account_number   text,
  server           text,
  broker           text,
  currency         text,
  leverage         int,
  ea_version       text,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,

  -- Latest state, overwritten on every sync.
  last_sync_at     timestamptz,
  balance          numeric,
  equity           numeric,
  credit           numeric,
  margin           numeric,
  free_margin      numeric,
  margin_level     numeric,
  open_positions   int,
  floating_pnl     numeric,

  -- Equity drawdown, tracked sync by sync from the first one onwards.
  -- peak_equity moves with deposits and withdrawals made after tracking
  -- began, so taking money out never reads as a loss.
  tracking_since   timestamptz,
  peak_equity      numeric,
  max_drawdown_pct numeric not null default 0,
  max_drawdown_at  timestamptz,
  last_sample_at   timestamptz,

  -- Set from the admin screen; the next sync tells the EA to resend its
  -- whole history, then clears it.
  resync_requested boolean not null default false
);

alter table public.accounts enable row level security;

create index if not exists accounts_project_idx on public.accounts (project_id);

drop policy if exists "members read accounts" on public.accounts;
create policy "members read accounts"
  on public.accounts for select
  to authenticated
  using (public.is_member());

-- Sync keys. Only the SHA-256 of a key is stored; the key itself is shown
-- once, when it is made. No policies: service role only.
create table if not exists public.account_keys (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  key_hash   text not null unique,
  key_hint   text not null,
  created_at timestamptz not null default now()
);

alter table public.account_keys enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Deals: every deal the terminal has, trades and balance operations.
--
-- kind is decided at ingest (src/lib/dealKinds.js):
--   trade  buys and sells             counts as trading P&L
--   other  swaps, charges, commission counts as trading P&L
--   cash   deposits and withdrawals   moves the balance, not the P&L
--   credit broker credit              touches neither
-- net = profit + swap + commission + fee, so a deal's effect on the balance
-- is always net (credit aside).
-- ---------------------------------------------------------------------------
create table if not exists public.deals (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  ticket      text not null,
  position_id text,
  time        timestamptz not null,
  type        text not null,
  entry       text,
  kind        text not null check (kind in ('trade', 'other', 'cash', 'credit')),
  symbol      text,
  volume      numeric,
  price       numeric,
  profit      numeric not null default 0,
  swap        numeric not null default 0,
  commission  numeric not null default 0,
  fee         numeric not null default 0,
  net         numeric not null default 0,
  magic       bigint,
  comment     text,
  primary key (account_id, ticket)
);

alter table public.deals enable row level security;

create index if not exists deals_account_time_idx on public.deals (account_id, time);
create index if not exists deals_account_position_idx on public.deals (account_id, position_id);

drop policy if exists "members read deals" on public.deals;
create policy "members read deals"
  on public.deals for select
  to authenticated
  using (public.is_member());

-- ---------------------------------------------------------------------------
-- 5. Equity samples: one every 15 minutes per account, for the chart.
-- ---------------------------------------------------------------------------
create table if not exists public.equity_samples (
  account_id uuid not null references public.accounts (id) on delete cascade,
  at         timestamptz not null,
  balance    numeric not null,
  equity     numeric not null,
  primary key (account_id, at)
);

alter table public.equity_samples enable row level security;

drop policy if exists "members read equity samples" on public.equity_samples;
create policy "members read equity samples"
  on public.equity_samples for select
  to authenticated
  using (public.is_member());

-- ---------------------------------------------------------------------------
-- 6. Views. security_invoker, so the RLS above applies to whoever reads them.
--
-- Days are London days, the same calendar ForexDNA uses. Keep LONDON in
-- src/lib/days.js in step if this ever changes.
-- ---------------------------------------------------------------------------

-- One row per account per day with any deal on it.
create or replace view public.account_daily
with (security_invoker = true) as
select
  d.account_id,
  (d.time at time zone 'Europe/London')::date                                     as day,
  coalesce(sum(d.net) filter (where d.kind in ('trade', 'other')), 0)             as trade_pnl,
  coalesce(sum(d.net) filter (where d.kind = 'cash'), 0)                          as cash_flow,
  count(*) filter (where d.kind = 'trade' and d.entry in ('out', 'inout', 'out_by')) as closed,
  count(*) filter (where d.kind = 'trade' and d.entry in ('out', 'inout', 'out_by') and d.net > 0) as wins,
  count(*) filter (where d.kind = 'trade' and d.entry in ('out', 'inout', 'out_by') and d.net < 0) as losses,
  coalesce(sum(d.net) filter (where d.kind = 'trade' and d.entry in ('out', 'inout', 'out_by') and d.net > 0), 0) as gross_profit,
  coalesce(sum(d.net) filter (where d.kind = 'trade' and d.entry in ('out', 'inout', 'out_by') and d.net < 0), 0) as gross_loss,
  coalesce(sum(d.volume) filter (where d.kind = 'trade' and d.entry in ('out', 'inout', 'out_by')), 0) as lots
from public.deals d
group by d.account_id, (d.time at time zone 'Europe/London')::date;

-- One row per position that has been at least partly closed.
create or replace view public.account_positions
with (security_invoker = true) as
select
  d.account_id,
  d.position_id,
  min(d.symbol)                                                         as symbol,
  -- The opening deal's own direction. A buy position is closed by a sell,
  -- so the closing deal's type is the opposite of the trade's.
  (array_agg(d.type order by d.time) filter (where d.entry = 'in'))[1] as side,
  min(d.time) filter (where d.entry = 'in')                             as open_time,
  max(d.time) filter (where d.entry in ('out', 'inout', 'out_by'))      as close_time,
  coalesce(sum(d.volume) filter (where d.entry = 'in'), 0)              as volume_in,
  coalesce(sum(d.volume) filter (where d.entry in ('out', 'inout', 'out_by')), 0) as volume_out,
  sum(d.price * d.volume) filter (where d.entry = 'in')
    / nullif(sum(d.volume) filter (where d.entry = 'in'), 0)            as open_price,
  sum(d.price * d.volume) filter (where d.entry in ('out', 'inout', 'out_by'))
    / nullif(sum(d.volume) filter (where d.entry in ('out', 'inout', 'out_by')), 0) as close_price,
  sum(d.net)                                                            as net
from public.deals d
where d.kind = 'trade' and d.position_id is not null
group by d.account_id, d.position_id
having count(*) filter (where d.entry in ('out', 'inout', 'out_by')) > 0;

-- ---------------------------------------------------------------------------
-- 7. The browser never needs the anon role for any of this.
-- ---------------------------------------------------------------------------
revoke all on public.members, public.projects, public.accounts, public.account_keys,
  public.deals, public.equity_samples, public.account_daily, public.account_positions
  from anon;
revoke all on public.account_keys from authenticated;
