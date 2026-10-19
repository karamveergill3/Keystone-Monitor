-- Keystone Monitor schema.
--
-- Applied by hand in the Supabase SQL editor. Written to be re-runnable:
-- every statement is "if not exists", "or replace", or a drop-then-create,
-- so running the whole file again after a change is always safe.
--
-- WHO CAN DO WHAT
--   * The site is open to anyone with its link, but the database is not:
--     every table has RLS on and no policies, and the browser roles (anon,
--     authenticated) are refused outright. Only the site's server reads,
--     with the service role, so a visitor sees what the pages render and
--     nothing else.
--   * Every write goes through the service role too: /api/sync after it
--     has checked the terminal's key, and the admin screen's actions after
--     they have checked the admin password. The functions that write
--     (sync_open_positions, track_baskets, admin_attempt, claim_print_job,
--     finish_print_job), and the two the fleet summary reads through
--     (floating_worst, equity_sample_gaps), can be run by the service role
--     only (section 10).
--   * Sync keys and print agent keys are stored only as SHA-256 hashes, in
--     their own tables.
--   * The admin sign-in's lockout lives here (section 7), so guesses at a
--     short ADMIN_PASSWORD are counted for everyone at once.
--
-- ROLLOUT: apply this file before deploying the code that goes with it.
-- The pages read what it adds, and the code still running keeps working
-- against it until the new code is live.

-- ---------------------------------------------------------------------------
-- 1. Projects: V100 and Cycle Method. Adding a third is one insert.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

-- No policies: only the server reads this. The drop removes the
-- members-only policy an older database still has.
drop policy if exists "members read projects" on public.projects;

insert into public.projects (slug, name, sort) values
  ('v100', 'V100', 1),
  ('cycle-method', 'Cycle Method', 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Accounts: one row per external MT5 account.
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
  resync_requested boolean not null default false,

  -- The p_at of the open positions snapshot stored last
  -- (sync_open_positions), so an older sync that arrives late is ignored.
  open_snapshot_at timestamptz,

  -- The broker's margin call and stop-out levels (ACCOUNT_MARGIN_SO_CALL
  -- and ACCOUNT_MARGIN_SO_SO), in stop_out_mode's unit: 'percent' is a
  -- margin level (equity over margin, as a percentage), 'money' is equity
  -- in the account's currency. Null until an EA from 2026.10.17.5 syncs;
  -- an older EA's sync leaves them as they are.
  stop_out_mode     text check (stop_out_mode in ('percent', 'money')),
  margin_call_level numeric,
  stop_out_level    numeric
);

-- A database made before these columns has the table without them.
alter table public.accounts add column if not exists open_snapshot_at timestamptz;
alter table public.accounts add column if not exists stop_out_mode text check (stop_out_mode in ('percent', 'money'));
alter table public.accounts add column if not exists margin_call_level numeric;
alter table public.accounts add column if not exists stop_out_level numeric;

alter table public.accounts enable row level security;

create index if not exists accounts_project_idx on public.accounts (project_id);

-- No policies (see projects above).
drop policy if exists "members read accounts" on public.accounts;

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
-- 3. Deals: every deal the terminal has, trades and balance operations.
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

-- No policies (see projects above).
drop policy if exists "members read deals" on public.deals;

-- ---------------------------------------------------------------------------
-- 4. Equity samples: one every 15 minutes per account, for the chart.
--
-- equity is MT5's own figure, which includes any broker credit; credit is
-- kept beside it so the chart can take it out (a sample from before the
-- column existed reads 0).
-- ---------------------------------------------------------------------------
create table if not exists public.equity_samples (
  account_id uuid not null references public.accounts (id) on delete cascade,
  at         timestamptz not null,
  balance    numeric not null,
  equity     numeric not null,
  credit     numeric not null default 0,
  primary key (account_id, at)
);

-- A database made before credit was sampled has the table without it.
alter table public.equity_samples add column if not exists credit numeric not null default 0;

alter table public.equity_samples enable row level security;

-- No policies (see projects above).
drop policy if exists "members read equity samples" on public.equity_samples;

-- What the fleet summary's floating drawdown reads (src/lib/data.js,
-- floatingHistoryFor). floating_worst: each account's worst open-trade
-- loss as a share of its balance across every sample, credit taken off
-- equity first as everywhere else, and when its samples begin.
-- equity_sample_gaps: each account's stretches longer than p_longer_than
-- with no sample, the last one running to now when it has gone quiet, so
-- the summary can say what the record does not cover. Read only. Service
-- role only (see section 10). If the arguments or columns ever change,
-- drop the old signature first.
create or replace function public.floating_worst(p_account_ids uuid[])
returns table (account_id uuid, worst_pct numeric, first_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select s.account_id,
         least(0, min((s.equity - s.credit - s.balance) / s.balance)) as worst_pct,
         min(s.at) as first_at
    from public.equity_samples s
   where s.account_id = any(p_account_ids) and s.balance > 0
   group by s.account_id;
$$;

create or replace function public.equity_sample_gaps(p_account_ids uuid[], p_longer_than interval)
returns table (account_id uuid, gap_from timestamptz, gap_to timestamptz)
language sql
stable
set search_path = ''
as $$
  select g.account_id, g.prev_at as gap_from, g.at as gap_to
    from (select s.account_id, s.at,
                 lag(s.at) over (partition by s.account_id order by s.at) as prev_at
            from public.equity_samples s
           where s.account_id = any(p_account_ids)) g
   where g.at - g.prev_at > p_longer_than
  union all
  select s.account_id, max(s.at), now()
    from public.equity_samples s
   where s.account_id = any(p_account_ids)
   group by s.account_id
  having now() - max(s.at) > p_longer_than
   order by gap_from;
$$;

-- ---------------------------------------------------------------------------
-- 5. Open positions: what each terminal has open right now.
--
-- A snapshot, not history: every sync from an EA that reports positions
-- replaces the account's rows with what it sent (sync_open_positions in
-- section 6), so a position closed on the terminal disappears here at the
-- next sync. A sync from an older EA
-- that does not report them leaves the rows alone; their updated_at is then
-- older than the account's last_sync_at, which is how the page knows not to
-- show them as current. Closed trades come from deals (account_positions
-- below), never from this table.
-- ---------------------------------------------------------------------------
create table if not exists public.open_positions (
  account_id    uuid not null references public.accounts (id) on delete cascade,
  ticket        text not null,
  symbol        text,
  side          text check (side in ('buy', 'sell')),
  volume        numeric,
  open_price    numeric,
  current_price numeric,
  sl            numeric,
  tp            numeric,
  swap          numeric,
  profit        numeric,
  open_time     timestamptz,
  magic         bigint,
  comment       text,
  updated_at    timestamptz not null default now(),
  -- POSITION_IDENTIFIER, what the position's deals carry as position_id.
  -- Null from an EA older than 2026.10.17.4; baskets then use the ticket,
  -- which on MT5 is the same number for a position opened by one order.
  position_id   text,
  -- What a 1.0 move in the symbol's price is worth on 1 lot, in the
  -- account's currency (SYMBOL_TRADE_TICK_VALUE_LOSS over
  -- SYMBOL_TRADE_TICK_SIZE), for how far price can move before stop-out.
  -- Null from an EA older than 2026.10.17.5, 0 when the terminal could
  -- not say.
  point_value   numeric,
  primary key (account_id, ticket)
);

-- A database made before these columns were sent has the table without them.
alter table public.open_positions add column if not exists position_id text;
alter table public.open_positions add column if not exists point_value numeric;

alter table public.open_positions enable row level security;

-- No policies (see projects above).

-- ---------------------------------------------------------------------------
-- 6. Baskets: the life of each grid basket, for its unrealised drawdown.
--
-- A basket is every open position on one account with the same symbol and
-- side. Magic numbers are ignored on purpose: some grid EAs give every
-- level its own magic, and splitting on it would hide a basket's real
-- depth, while merging two EAs' positions overstates it, which is the safe
-- direction for a risk alert. A position with no symbol or side is in no
-- basket.
--
-- floating is profit + swap over the basket's positions, in the account's
-- currency; its drawdown is how far that is below zero. One row per
-- basket's life: it is opened the first time a sync lists its key and
-- closed by the first complete sync without it (track_baskets below), so
-- worst_floating is the deepest the basket went while the syncs watched
-- it. Like the account's max drawdown, a dip between two syncs is not seen.
-- ---------------------------------------------------------------------------
create table if not exists public.baskets (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts (id) on delete cascade,
  symbol         text not null,
  side           text not null check (side in ('buy', 'sell')),
  opened_at      timestamptz not null,       -- earliest open_time of any position seen in it
  first_seen_at  timestamptz not null,
  last_seen_at   timestamptz not null,       -- the last sync that listed it
  closed_at      timestamptz,                -- null while open
  positions      int not null,               -- as at last_seen_at
  lots           numeric not null,
  max_positions  int not null,
  max_lots       numeric not null,
  floating       numeric not null,           -- as at last_seen_at
  worst_floating numeric not null,           -- the lowest floating seen
  worst_at       timestamptz not null,
  worst_balance  numeric,                    -- the balance at worst_at, for a percentage
  position_ids   text[] not null default '{}' -- every position ever in it, to find its deals
);

alter table public.baskets enable row level security;

-- At most one open basket per key: track_baskets upserts against this.
create unique index if not exists baskets_open_key_idx
  on public.baskets (account_id, symbol, side) where closed_at is null;
create index if not exists baskets_account_closed_idx
  on public.baskets (account_id, closed_at desc);

-- No policies (see projects above).

-- Brings an account's baskets up to date with the snapshot just written,
-- the rows stamped p_at. sync_open_positions below calls it straight after
-- its replace, in the same transaction; /api/sync never calls it itself.
--
-- p_complete says the snapshot is the terminal's whole list. Only then is
-- a basket missing from it closed: a list cut short at the EA's cap, or one
-- shorter than the terminal's own count because a position changed between
-- the EA's two reads, could otherwise end a basket that is still open and
-- lose its worst reading. Its key coming back later with none of the same
-- positions is a new basket either way: the old one closed between syncs.
--
-- Safe to repeat: the EA resends a sync whose reply it never got, and the
-- same p_at and snapshot leave the same rows. It locks the account's row,
-- which sync_open_positions already holds; the lock only matters if this
-- is ever run on its own. Service role only (see section 10). If the
-- arguments ever change, drop this signature first: "create or replace"
-- would add a second function beside it rather than replace it.
create or replace function public.track_baskets(p_account uuid, p_at timestamptz, p_balance numeric, p_complete boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.accounts a where a.id = p_account for update;

  -- The key is still open but none of its positions are: closed and
  -- reopened between two syncs.
  update public.baskets b
     set closed_at = p_at
   where b.account_id = p_account
     and b.closed_at is null
     and exists (
       select 1 from public.open_positions o
        where o.account_id = p_account and o.updated_at = p_at
          and o.symbol = b.symbol and o.side = b.side)
     and not exists (
       select 1 from public.open_positions o
        where o.account_id = p_account and o.updated_at = p_at
          and o.symbol = b.symbol and o.side = b.side
          and coalesce(o.position_id, o.ticket) = any (b.position_ids));

  if p_complete then
    update public.baskets b
       set closed_at = p_at
     where b.account_id = p_account
       and b.closed_at is null
       and not exists (
         select 1 from public.open_positions o
          where o.account_id = p_account and o.updated_at = p_at
            and o.symbol = b.symbol and o.side = b.side);
  end if;

  -- In the ON CONFLICT branch every right-hand side reads the row as it
  -- was, so worst_at and worst_balance compare against the old worst.
  insert into public.baskets as b
    (account_id, symbol, side, opened_at, first_seen_at, last_seen_at, positions, lots,
     max_positions, max_lots, floating, worst_floating, worst_at, worst_balance, position_ids)
  select p_account, g.symbol, g.side, coalesce(g.opened_at, p_at), p_at, p_at, g.positions, g.lots,
         g.positions, g.lots, g.floating, g.floating, p_at, p_balance, g.ids
    from (
      select o.symbol, o.side,
             count(*)::int                                          as positions,
             coalesce(sum(o.volume), 0)                             as lots,
             sum(coalesce(o.profit, 0) + coalesce(o.swap, 0))       as floating,
             min(o.open_time)                                       as opened_at,
             array_agg(distinct coalesce(o.position_id, o.ticket))  as ids
        from public.open_positions o
       where o.account_id = p_account and o.updated_at = p_at
         and o.symbol is not null and o.side is not null
       group by o.symbol, o.side
    ) g
  on conflict (account_id, symbol, side) where closed_at is null do update set
    last_seen_at   = excluded.last_seen_at,
    positions      = excluded.positions,
    lots           = excluded.lots,
    floating       = excluded.floating,
    max_positions  = greatest(b.max_positions, excluded.positions),
    max_lots       = greatest(b.max_lots, excluded.lots),
    opened_at      = least(b.opened_at, excluded.opened_at),
    position_ids   = array(select distinct u from unnest(b.position_ids || excluded.position_ids) u order by u),
    worst_floating = least(b.worst_floating, excluded.floating),
    worst_at       = case when excluded.floating < b.worst_floating then excluded.worst_at else b.worst_at end,
    worst_balance  = case when excluded.floating < b.worst_floating then excluded.worst_balance else b.worst_balance end;
end;
$$;

-- What /api/sync calls with each sync's open positions: the snapshot
-- replaced and the baskets tracked on it, in one transaction.
--
-- ONE STEP, NOT TWO. Two syncs for one account can overlap (the EA on two
-- charts, or a VPS and a home terminal on one login). As two calls, A's
-- replace, B's replace and then A's tracking would track A against B's
-- rows: every basket missing from them closed, split in two, its worst
-- reading lost. Here the account's row is locked first, so syncs for one
-- account take turns (other accounts' run alongside), and a sync older
-- than the snapshot already stored (open_snapshot_at newer than p_at) has
-- arrived late and changes nothing: the newer list stands. The same p_at
-- again is a resend of a sync whose reply was lost and is replayed, which
-- leaves the same rows.
--
-- p_rows is a JSON list of what src/lib/syncPayload.js returns for each
-- position, position_id and point_value included; a key it does not list
-- is dropped, and one a row lacks is null. The rows are stamped p_at. The
-- replace is part of the call's one transaction, so a failed insert undoes
-- the delete: the call fails and the previous snapshot stays. The
-- tracking runs in its own block: if it fails, only it is undone, with a
-- warning in the database log, and the snapshot still lands. Baskets are
-- derived data that the next good sync puts right, and a failure there
-- must never stop the account syncing.
--
-- Service role only (see section 10). If the arguments ever change, drop
-- this signature first, as with track_baskets.
create or replace function public.sync_open_positions(
  p_account uuid, p_rows jsonb, p_at timestamptz, p_balance numeric, p_complete boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_at   timestamptz := coalesce(p_at, now());
  v_last timestamptz;
begin
  select a.open_snapshot_at into v_last from public.accounts a where a.id = p_account for update;
  if not found then
    raise exception 'no account %', p_account using errcode = 'foreign_key_violation';
  end if;
  if v_last > v_at then
    return;
  end if;

  delete from public.open_positions where account_id = p_account;
  insert into public.open_positions
    (account_id, ticket, symbol, side, volume, open_price, current_price, sl, tp, swap, profit,
     open_time, magic, comment, updated_at, position_id, point_value)
  select p_account, r.ticket, r.symbol, r.side, r.volume, r.open_price, r.current_price, r.sl, r.tp,
         r.swap, r.profit, r.open_time, r.magic, r.comment, v_at, r.position_id, r.point_value
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r (
      ticket text, symbol text, side text, volume numeric, open_price numeric, current_price numeric,
      sl numeric, tp numeric, swap numeric, profit numeric, open_time timestamptz, magic bigint,
      comment text, position_id text, point_value numeric
    );
  update public.accounts set open_snapshot_at = v_at where id = p_account;

  begin
    perform public.track_baskets(p_account, v_at, p_balance, p_complete);
  exception when others then
    raise warning 'basket tracking failed for account %: % (%)', p_account, sqlerrm, sqlstate;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Admin lockout: the guard on the admin sign-in form.
--
-- ADMIN_PASSWORD may be a 4-digit PIN, so wrong guesses are counted here,
-- from anyone, anywhere: after p_max wrong tries in a row, every attempt
-- is refused for p_lock, the right PIN included, so a guess made during the
-- lock reveals nothing. A right PIN while not locked resets the count.
--
-- One row per password. tag identifies an ADMIN_PASSWORD without
-- revealing it: an HMAC of it keyed by a secret only the server has
-- (src/lib/adminAuth.js adminTag), never the PIN or its plain hash. A new
-- password in Vercel gets a row of its own, with no lock and no count:
-- that is the owner's way back in when a bot has locked admin. Each row
-- keeps its own count, so an old deployment still running the old PIN, or
-- a local copy with another one, can never reset the current one's.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_guard (
  tag          text primary key,
  failures     int not null default 0,
  locked_until timestamptz
);

alter table public.admin_guard enable row level security;

-- No policies (see projects above).

-- What the sign-in action calls on every attempt, with p_ok saying whether
-- the PIN was right (checked on the server, timing-safe). Returns
--   locked_until  set: admin is locked until then; refuse.
--                 null: let in when p_ok, otherwise one more wrong try.
--   failures      wrong tries in a row so far (0 once a lock starts).
-- The row is locked first, so attempts made at the same moment take turns
-- and each is counted. Service role only (see section 10). If the
-- arguments ever change, drop this signature first, as with track_baskets.
create or replace function public.admin_attempt(
  p_tag text, p_ok boolean, p_max int, p_lock interval,
  out locked_until timestamptz, out failures int)
language plpgsql
set search_path = ''
as $$
declare
  v_failures int;
  v_until    timestamptz;
begin
  if p_tag is null or p_tag = '' then
    raise exception 'admin_attempt needs a tag';
  end if;
  insert into public.admin_guard (tag) values (p_tag) on conflict (tag) do nothing;
  select g.failures, g.locked_until into v_failures, v_until
    from public.admin_guard g where g.tag = p_tag for update;

  if v_until > now() then
    -- Locked: refused whatever p_ok says, and the count is left alone.
    null;
  elsif p_ok then
    v_failures := 0;
    v_until := null;
  else
    v_failures := v_failures + 1;
    v_until := null;
    if v_failures >= greatest(coalesce(p_max, 1), 1) then
      v_until := now() + p_lock;
      v_failures := 0;
    end if;
  end if;

  update public.admin_guard g
     set failures = v_failures, locked_until = v_until
   where g.tag = p_tag;

  locked_until := case when v_until > now() then v_until end;
  failures := v_failures;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Views. security_invoker, so the RLS above applies to whoever reads them.
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

-- One row per basket, with what its deals have realised so far, entry
-- commission and swap included. realised is null until one of them has a
-- deal; last_close_at is its latest closing deal. The columns are listed
-- rather than b.*, so a column added to baskets later cannot land in the
-- middle of this view.
--
-- A basket's deals are those of its positions:
--   * every position a sync saw in it (position_ids), and
--   * every position whose opening deal is on its symbol and side between
--     its opened_at and last_seen_at: a grid level opened and closed
--     between two syncs was never listed, but its result is the basket's,
--
-- and of those, only the deals on the basket's side within its life:
-- an opening deal of its own direction, or a closing one the other way
-- (a buy is closed by a sell), from a minute before it opened to five
-- minutes after it closed (the closing deals land just before the sync
-- that sees the basket gone, or just after when they arrive late). The
-- side filter matters on a netting account, where a reversal keeps the
-- position id: the buy basket gets the reversal's close and the sell
-- basket the later close of what was reversed into, never both.
create or replace view public.basket_results
with (security_invoker = true) as
select
  b.id, b.account_id, b.symbol, b.side, b.opened_at, b.first_seen_at, b.last_seen_at, b.closed_at,
  b.positions, b.lots, b.max_positions, b.max_lots, b.floating, b.worst_floating, b.worst_at,
  b.worst_balance, b.position_ids,
  r.realised,
  r.last_close_at
from public.baskets b
left join lateral (
  select
    sum(d.net)                                                      as realised,
    max(d.time) filter (where d.entry in ('out', 'out_by', 'inout')) as last_close_at
  from public.deals d
  where d.account_id = b.account_id
    and d.time >= b.opened_at - interval '1 minute'
    and (b.closed_at is null or d.time <= b.closed_at + interval '5 minutes')
    and ((d.entry = 'in' and d.type = b.side)
         or (d.entry in ('out', 'out_by', 'inout') and d.type in ('buy', 'sell') and d.type <> b.side))
    and (d.position_id = any (b.position_ids)
         or exists (
           select 1 from public.deals o
            where o.account_id = b.account_id
              and o.position_id = d.position_id
              and o.entry = 'in'
              and o.symbol = b.symbol
              and o.type = b.side
              and o.time between b.opened_at and b.last_seen_at))
) r on true;

-- ---------------------------------------------------------------------------
-- 9. Print queue: the office printer, pull-only.
--
-- A web page cannot reach a printer, so nothing ever connects to the
-- office. An admin's Print button adds a row to print_jobs; a
-- small agent on the office Mac (scripts/print-agent.mjs) asks
-- /api/print-queue every few seconds with its own key, which calls
-- claim_print_job, downloads the PDF, prints it and reports back through
-- finish_print_job. A Mac that is asleep simply leaves the job queued.
--
-- Agent keys are stored only as their SHA-256, in hex, in
-- print_agent_keys, one row per key; the site hashes the key it is sent
-- and the functions below decide whether it is known. Making one is one
-- insert (docs/print-agent.md); rotating one is an insert and a delete.
-- print_agents is each agent's last poll, which is how the button knows
-- whether the printer is online.
-- ---------------------------------------------------------------------------
create table if not exists public.print_jobs (
  id           bigint generated always as identity primary key,
  kind         text not null
               check (kind in ('fleet_summary', 'project_report', 'account_report')),
  -- The report on this site the agent downloads: the fleet summary, or a
  -- project's or an account's report with the dates the admin picked.
  -- Never a whole URL, so a row can only ever point at this site.
  path         text not null default '/api/reports/fleet'
               check (path ~ '^/api/reports/(fleet|project/[a-z0-9-]{1,40}|account/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\?(from=[0-9]{4}-[0-9]{2}-[0-9]{2}(&to=[0-9]{4}-[0-9]{2}-[0-9]{2})?|to=[0-9]{4}-[0-9]{2}-[0-9]{2}))?$'),
  copies       int not null default 1 check (copies between 1 and 5),
  status       text not null default 'queued'
               check (status in ('queued', 'printing', 'printed', 'failed')),
  requested_at timestamptz not null default now(),
  claimed_at   timestamptz,
  finished_at  timestamptz,
  agent        text,
  error        text
);

create index if not exists print_jobs_status_requested_at
  on public.print_jobs (status, requested_at);

-- The kind says which report the path is.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'print_jobs_kind_matches_path') then
    alter table public.print_jobs add constraint print_jobs_kind_matches_path check (
         (kind = 'fleet_summary' and path = '/api/reports/fleet')
      or (kind = 'project_report' and path like '/api/reports/project/%')
      or (kind = 'account_report' and path like '/api/reports/account/%'));
  end if;
end
$$;

-- One waiting job per report: a second click while the Mac is asleep is
-- handed the first job (src/lib/printQueue.js), so it prints once.
create unique index if not exists print_jobs_one_queued_per_path
  on public.print_jobs (path) where status = 'queued';

create table if not exists public.print_agents (
  name         text primary key,
  printer      text,
  version      text,
  last_seen_at timestamptz not null
);

create table if not exists public.print_agent_keys (
  -- The hash, never the key: 64 lower-case hex characters.
  key_hash   text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  label      text,
  created_at timestamptz not null default now()
);

alter table public.print_jobs enable row level security;
alter table public.print_agents enable row level security;
alter table public.print_agent_keys enable row level security;

-- No policies (see projects above).

-- What the agent's poll calls. Refuses a key hash that is not in
-- print_agent_keys with SQLSTATE 28000 (the route answers 401), then:
--   * records the agent's heartbeat (print_agents),
--   * fails a job left in 'printing' for over 10 minutes (the agent died
--     mid-job; reprinting it unasked could print twice),
--   * fails a job still 'queued' after 24 hours (a summary that old is
--     not what anyone asked for),
--   * claims the oldest queued job, if any, and returns it.
-- Returns no row when there is nothing to print. skip locked, so two
-- agents polling at once never both get the same job. Service role only
-- (see section 10). If the arguments ever change, drop this signature
-- first, as with track_baskets.
create or replace function public.claim_print_job(
  p_key_hash text, p_agent text, p_printer text, p_version text)
returns setof public.print_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_agent text := left(btrim(coalesce(p_agent, '')), 64);
  v_id    bigint;
begin
  if p_key_hash is null
     or not exists (select 1 from public.print_agent_keys k where k.key_hash = p_key_hash) then
    raise exception 'unknown print agent key' using errcode = '28000';
  end if;
  if v_agent = '' then
    raise exception 'claim_print_job needs an agent name' using errcode = '22023';
  end if;

  insert into public.print_agents as a (name, printer, version, last_seen_at)
    values (v_agent, left(p_printer, 128), left(p_version, 32), now())
  on conflict (name) do update
    set printer = excluded.printer, version = excluded.version, last_seen_at = excluded.last_seen_at;

  update public.print_jobs j
     set status = 'failed', finished_at = now(),
         error = 'The print agent did not report back within 10 minutes.'
   where j.status = 'printing' and j.claimed_at < now() - interval '10 minutes';

  update public.print_jobs j
     set status = 'failed', finished_at = now(),
         error = 'Not printed within 24 hours: the office Mac was not on.'
   where j.status = 'queued' and j.requested_at < now() - interval '24 hours';

  select j.id into v_id
    from public.print_jobs j
   where j.status = 'queued'
   order by j.requested_at, j.id
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
    update public.print_jobs j
       set status = 'printing', claimed_at = now(), agent = v_agent
     where j.id = v_id
    returning j.*;
end;
$$;

-- What the agent's report calls once lp has run. Marks a job that is
-- 'printing' as printed or failed, with lp's own error trimmed to 300
-- characters, and returns whether it did. A job in any other state (failed
-- by the 10-minute rule meanwhile, or never claimed) is left alone. Same
-- key check as claim_print_job. Service role only (see section 10).
create or replace function public.finish_print_job(
  p_key_hash text, p_id bigint, p_ok boolean, p_error text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_key_hash is null
     or not exists (select 1 from public.print_agent_keys k where k.key_hash = p_key_hash) then
    raise exception 'unknown print agent key' using errcode = '28000';
  end if;

  update public.print_jobs j
     set status = case when p_ok then 'printed' else 'failed' end,
         finished_at = now(),
         error = case when p_ok then null
                      else left(coalesce(nullif(btrim(p_error), ''), 'The printer gave no reason.'), 300) end
   where j.id = p_id and j.status = 'printing';
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. The browser roles get nothing. Only the server's service role reads.
-- ---------------------------------------------------------------------------
revoke all on public.projects, public.accounts, public.account_keys,
  public.deals, public.equity_samples, public.open_positions, public.baskets,
  public.account_daily, public.account_positions, public.basket_results,
  public.admin_guard, public.print_jobs, public.print_agents, public.print_agent_keys
  from anon, authenticated;

-- Postgres lets everyone run a new function, and Supabase grants the
-- browser roles every function in public by default. Most of these write,
-- and the two that read return what the tables behind them hold, so only
-- the server may call them.
revoke all on function public.track_baskets(uuid, timestamptz, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.track_baskets(uuid, timestamptz, numeric, boolean) to service_role;
revoke all on function public.sync_open_positions(uuid, jsonb, timestamptz, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.sync_open_positions(uuid, jsonb, timestamptz, numeric, boolean) to service_role;
revoke all on function public.admin_attempt(text, boolean, int, interval)
  from public, anon, authenticated;
grant execute on function public.admin_attempt(text, boolean, int, interval) to service_role;
revoke all on function public.claim_print_job(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_print_job(text, text, text, text) to service_role;
revoke all on function public.finish_print_job(text, bigint, boolean, text)
  from public, anon, authenticated;
grant execute on function public.finish_print_job(text, bigint, boolean, text) to service_role;
revoke all on function public.floating_worst(uuid[])
  from public, anon, authenticated;
grant execute on function public.floating_worst(uuid[]) to service_role;
revoke all on function public.equity_sample_gaps(uuid[], interval)
  from public, anon, authenticated;
grant execute on function public.equity_sample_gaps(uuid[], interval) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Leftovers. A fresh database never has them; a re-run removes them from
-- an older one.
-- ---------------------------------------------------------------------------

-- From when partners signed in: who could sign in, never any account data.
-- The policies that used is_member() are dropped above.
drop table if exists public.members;
drop function if exists public.is_member();

-- The open positions replace from before basket tracking, superseded by
-- sync_open_positions (section 6), which the live site now calls instead.
drop function if exists public.replace_open_positions(uuid, jsonb, timestamptz);
