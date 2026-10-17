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
-- Days are London days. Keep LONDON in src/lib/days.js in step if this ever
-- changes.
--
-- COLUMNS ARE ONLY EVER ADDED AT THE END. "create or replace view" refuses
-- to rename, reorder or retype an existing column, and this file must stay
-- re-runnable against a database that already has the views.
-- ---------------------------------------------------------------------------

-- One row per position that has been at least partly closed.
--
-- A deal's volume is split into the part that opened exposure and the part
-- that closed it. On a hedging account that is simple: "in" opens, "out"
-- closes. On a netting account an "inout" deal reverses the position,
-- closing what was open and opening the rest the other way under the same
-- position id, so its closing part is the size of the position just before
-- it. Without the split a 1-lot buy reversed into a 1-lot sell read as
-- 3 lots closed.
create or replace view public.account_positions
with (security_invoker = true) as
with legs as (
  select
    d.*,
    abs(coalesce(sum(case when d.type = 'buy' then d.volume else -d.volume end) over (
      partition by d.account_id, d.position_id
      order by d.time, d.ticket::numeric
      rows between unbounded preceding and 1 preceding
    ), 0)) as open_before
  from public.deals d
  where d.type in ('buy', 'sell') and d.position_id is not null
),
parts as (
  select
    l.*,
    case l.entry
      when 'in' then l.volume
      when 'inout' then greatest(l.volume - l.open_before, 0)
      else 0
    end as opened,
    case
      when l.entry in ('out', 'out_by') then l.volume
      when l.entry = 'inout' then least(l.volume, l.open_before)
      else 0
    end as closed
  from legs l
)
select
  p.account_id,
  p.position_id,
  min(p.symbol)                                                         as symbol,
  -- The opening deal's own direction. A buy position is closed by a sell,
  -- so the closing deal's type is the opposite of the trade's.
  (array_agg(p.type order by p.time, p.ticket::numeric) filter (where p.entry = 'in'))[1] as side,
  min(p.time) filter (where p.entry = 'in')                             as open_time,
  max(p.time) filter (where p.closed > 0)                               as close_time,
  coalesce(sum(p.opened), 0)                                            as volume_in,
  coalesce(sum(p.closed), 0)                                            as volume_out,
  sum(p.price * p.opened) / nullif(sum(p.opened), 0)                    as open_price,
  sum(p.price * p.closed) / nullif(sum(p.closed), 0)                    as close_price,
  sum(p.net)                                                            as net
from parts p
group by p.account_id, p.position_id
having sum(p.closed) > 0;

-- One row per account per London day with any deal or closed trade on it.
--
-- Money comes from deals, on the day each was booked, so an entry
-- commission lands on the day it was charged. The trade record comes from
-- positions, counted once on the day each last closed, with its whole net:
-- entry commission and swap included, and a position closed in two halves
-- still one trade.
create or replace view public.account_daily
with (security_invoker = true) as
with money as (
  select
    d.account_id,
    (d.time at time zone 'Europe/London')::date                         as day,
    coalesce(sum(d.net) filter (where d.kind in ('trade', 'other')), 0) as trade_pnl,
    coalesce(sum(d.net) filter (where d.kind = 'cash'), 0)              as cash_flow,
    coalesce(sum(d.net) filter (where d.kind = 'cash' and d.net > 0), 0) as deposits,
    coalesce(sum(d.net) filter (where d.kind = 'cash' and d.net < 0), 0) as withdrawals
  from public.deals d
  group by d.account_id, (d.time at time zone 'Europe/London')::date
),
record as (
  select
    p.account_id,
    (p.close_time at time zone 'Europe/London')::date                  as day,
    count(*)                                                            as closed,
    count(*) filter (where p.net > 0)                                   as wins,
    count(*) filter (where p.net < 0)                                   as losses,
    coalesce(sum(p.net) filter (where p.net > 0), 0)                    as gross_profit,
    coalesce(sum(p.net) filter (where p.net < 0), 0)                    as gross_loss,
    coalesce(sum(p.volume_out), 0)                                      as lots
  from public.account_positions p
  group by p.account_id, (p.close_time at time zone 'Europe/London')::date
)
select
  coalesce(m.account_id, r.account_id)  as account_id,
  coalesce(m.day, r.day)                as day,
  coalesce(m.trade_pnl, 0)              as trade_pnl,
  coalesce(m.cash_flow, 0)              as cash_flow,
  coalesce(r.closed, 0)                 as closed,
  coalesce(r.wins, 0)                   as wins,
  coalesce(r.losses, 0)                 as losses,
  coalesce(r.gross_profit, 0)           as gross_profit,
  coalesce(r.gross_loss, 0)             as gross_loss,
  coalesce(r.lots, 0)                   as lots,
  coalesce(m.deposits, 0)               as deposits,
  coalesce(m.withdrawals, 0)            as withdrawals
from money m
full outer join record r on r.account_id = m.account_id and r.day = m.day;

-- ---------------------------------------------------------------------------
-- 7. The browser never needs the anon role for any of this.
-- ---------------------------------------------------------------------------
revoke all on public.members, public.projects, public.accounts, public.account_keys,
  public.deals, public.equity_samples, public.account_daily, public.account_positions
  from anon;
revoke all on public.account_keys from authenticated;
