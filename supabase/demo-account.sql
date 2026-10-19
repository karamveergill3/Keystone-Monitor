-- DEMO ACCOUNTS: sample data so the site has something to show, and enough
-- of it for the overview to mean something, before real terminals are
-- connected. Run it in the Supabase SQL editor, after schema.sql. It is safe
-- to run again: every run deletes the eight accounts below (their deals,
-- samples, positions and baskets go with them) and builds them afresh.
-- Nothing in it is a real account.
--
--   id    project       label                           size        this week  open baskets
--   d001  V100          DEMO · Test account · 50k       USD 50,000      +500   XAUUSD buy 6, EURUSD sell 3, NAS100 buy 2
--   d002  V100          DEMO · V100 · 100k              USD 100,000   +1,850   GBPUSD buy 4, US30 sell 3, XAUUSD sell 2
--   d003  V100          DEMO · V100 · 25k               USD 25,000      -420   EURUSD buy 4, NAS100 sell 2
--   d004  V100          DEMO · V100 · 10k               USD 10,000      +140   none
--   d005  Cycle Method  DEMO · Cycle · 30k GBP          GBP 30,000      +740   XAUUSD sell 4, GBPUSD buy 2
--   d006  Cycle Method  DEMO · Cycle · 75k              USD 75,000    +1,200   US30 buy 7, EURUSD sell 2
--   d007  Cycle Method  DEMO · Cycle · 20k              USD 20,000      +610   XAUUSD buy 3 (last synced 6 hours ago)
--   d008  Cycle Method  DEMO · Cycle · new account      never synced: the row and nothing else
--
-- (ids in full: d0000000-0000-4000-8000-00000000d001 to ...d008.)
--
-- Each synced account is set up like a mean reversion grid account: a
-- deposit about four months ago, weekday trades since (single trades
-- until the last 30 days, then grid baskets, each closed together),
-- sometimes a withdrawal, 30 days of 15-minute equity samples, and the
-- grid baskets above open now. Lots, prices and P&L scale with the
-- account's size, and every profit is the one its prices and point value
-- give. setseed makes each account the same on every run of the same day.
--
-- THIS WEEK. "This week" on the site is the realised trading P&L since
-- Monday 00:00 London. Each account's comes out at the figure in the table
-- above, to the cent, whatever day this is run: the last closed basket,
-- inside this London week and before now, is sized to make it so. So the
-- green closable flags are the same every time: d001 EURUSD; d002 GBPUSD
-- and US30; d003 none (its week is down); d004 none (nothing open); d005
-- XAUUSD and GBPUSD; d006 EURUSD; d007 XAUUSD. A basket is closable when
-- it is in loss and the week would still be up after closing it.
--
-- MARKET TIME. Markets are shut from Friday 22:00 to Sunday 22:00, London.
-- Run at a weekend, everything that moves with the market (the open
-- positions' and baskets' times, the baskets' slides, the equity dips)
-- ends at the last close and floating stays flat after it; only the sync
-- times (last_sync_at, last_seen_at, updated_at) are now. Offsets such as
-- "70 hours ago" are market hours, so no position opens while markets are
-- shut. d007 last synced 6 hours ago (at a weekend its figures are as of
-- the last close, as a terminal's would be). (Run in the first hours of a
-- Monday, its last sync is made a little after Monday 00:00, so that it
-- can have a week at all.)
--
-- TO REMOVE THEM ALL (deals, samples, positions and baskets go with them):
--   delete from public.accounts where id in (
--     'd0000000-0000-4000-8000-00000000d001', 'd0000000-0000-4000-8000-00000000d002',
--     'd0000000-0000-4000-8000-00000000d003', 'd0000000-0000-4000-8000-00000000d004',
--     'd0000000-0000-4000-8000-00000000d005', 'd0000000-0000-4000-8000-00000000d006',
--     'd0000000-0000-4000-8000-00000000d007', 'd0000000-0000-4000-8000-00000000d008');
-- Or archive one from the admin screen to hide it and keep its data.
--
-- HOW IT IS BUILT. Four helper functions in pg_temp (this session only,
-- dropped at the end): demo_m and demo_t convert between instants and
-- market seconds, demo_sym holds each symbol's figures, and demo_account
-- builds one account from its line in the list at the bottom.

delete from public.accounts where id in (
  'd0000000-0000-4000-8000-00000000d001', 'd0000000-0000-4000-8000-00000000d002',
  'd0000000-0000-4000-8000-00000000d003', 'd0000000-0000-4000-8000-00000000d004',
  'd0000000-0000-4000-8000-00000000d005', 'd0000000-0000-4000-8000-00000000d006',
  'd0000000-0000-4000-8000-00000000d007', 'd0000000-0000-4000-8000-00000000d008');

-- Market seconds: how much open market lies between a fixed Sunday and t.
-- A market week runs from Sunday 22:00 to Friday 22:00 London, 120 hours;
-- a moment at a weekend counts as the close before it. In London time, so
-- a clock change (always at a weekend) changes nothing.
create or replace function pg_temp.demo_m(t timestamptz) returns numeric
language sql stable as $$
  select ((w::date - date '2000-01-02') / 7)::numeric * 432000
         + least(extract(epoch from l - w), 432000)
    from (select l, date_trunc('week', l + interval '2 hours') - interval '2 hours' as w
            from (select t at time zone 'Europe/London' as l) a) b
$$;

-- The instant at a number of market seconds: demo_t(demo_m(t)) is t while
-- markets are open, and the last close when they are shut.
create or replace function pg_temp.demo_t(m numeric) returns timestamptz
language sql stable as $$
  select ((date '2000-01-02' + (k * 7)::int) + time '22:00' + (m - k * 432000) * interval '1 second')
         at time zone 'Europe/London'
    from (select ceil(m / 432000) - 1 as k) a
$$;

-- Each symbol: a typical price and its decimals, a grid step, what 1.00 of
-- price is worth on 1 lot in USD (100 oz of gold, 100,000 of a currency,
-- 1 per index point), lots per $50,000 of account, how deep a closed
-- basket goes per lot, swap per lot per night, contract size, and the
-- leverage cap (indices at 1:100, as retail brokers have them).
create or replace function pg_temp.demo_sym(p_sym text)
returns table (base numeric, places int, step numeric, pv numeric, lot_scale numeric,
               depth numeric, swap numeric, contract numeric, max_lev int)
language sql stable as $$
  select v.base, v.places, v.step, v.pv, v.lot_scale, v.depth, v.swap, v.contract, v.max_lev
    from (values
      ('XAUUSD', 2650::numeric, 2,      5::numeric, 100::numeric,     1::numeric, 500::numeric, 7::numeric,   100::numeric,    1000),
      ('EURUSD', 1.08,          5, 0.0012,          100000,           3,          120,          0.9,          100000,          1000),
      ('GBPUSD', 1.27,          5, 0.0015,          100000,           3,          150,          0.8,          100000,          1000),
      ('US30',   42000,         2,     60,          1,                10,         60,           0.5,          1,               100),
      ('NAS100', 20000,         2,     25,          1,                10,         25,           0.4,          1,               100)
    ) v (sym, base, places, step, pv, lot_scale, depth, swap, contract, max_lev)
   where v.sym = p_sym
$$;

-- One account from its spec (see the list at the bottom). p_now is the
-- moment the data is made as of: now() on every real run.
create or replace function pg_temp.demo_account(spec jsonb, p_now timestamptz) returns void
language plpgsql as $demo$
declare
  acc uuid := (spec->>'id')::uuid;
  ccy text := spec->>'ccy';
  fx numeric := (spec->>'fx')::numeric;          -- USD per unit of the account's currency
  size numeric := (spec->>'size')::numeric;
  lev int := (spec->>'lev')::int;
  week_target numeric := (spec->>'week')::numeric;
  magic bigint := (spec->>'magic')::bigint;
  sm numeric := (spec->>'size')::numeric / 50000;                                -- money scale
  sl numeric := (spec->>'size')::numeric * (spec->>'fx')::numeric / 50000;      -- lot scale
  keys text[] := array['XAUUSD|buy', 'XAUUSD|sell', 'EURUSD|buy', 'EURUSD|sell', 'GBPUSD|buy',
                       'GBPUSD|sell', 'US30|buy', 'US30|sell', 'NAS100|buy', 'NAS100|sell'];
  ladder numeric[] := array[0.10, 0.10, 0.15, 0.20, 0.30, 0.45, 0.65];
  tk bigint := 6000000 + (spec->>'n')::bigint * 1000000;
  tk_open bigint := 6999000 + (spec->>'n')::bigint * 1000000;  -- open positions' tickets
  s record;
  b jsonb;
  i int;
  j int;
  k int;
  n int;
  day date;
  key text;
  sym text;
  side text;
  dir int;
  vol numeric;
  pv numeric;
  p_open numeric;
  p_close numeric;
  pl numeric;
  comm numeric;
  swp numeric;
  move numeric;
  t_open timestamptz;
  t_close timestamptz;
  prices numeric[];
  lots numeric[];
  swaps numeric[];
  profits numeric[];
  hours numeric[];
  times timestamptz[];
  comms numeric[];
  sum_lots numeric;
  wavg numeric;
  target numeric;
  mult numeric;
  resid numeric;
  bal numeric;

  -- The frame (see MARKET TIME and THIS WEEK in the header).
  t_sync timestamptz;   -- the last sync: now, or 6 hours ago for an offline account
  m_mkt numeric;        -- market seconds at the last sync
  mkt timestamptz;      -- the last sync, or the last close before it at a weekend
  wk timestamptz;       -- Monday 00:00 London of this week (the site's "this week")
  t_end timestamptz;    -- the last equity sample
  t_start timestamptz;  -- the first
  we timestamptz;       -- the end of this week's trading here: the last sample, or the close (Friday's, on a Sunday)
  m_we numeric;
  d_today date;         -- the London day of we: history runs up to the day before
  d0 date;              -- the deposit's day
  wd date;              -- the withdrawal's day, if any
  w_hist numeric;       -- this week's realised P&L before the balancing basket
  seg numeric;          -- market seconds of we's own trading session, back to Monday 00:00 at most
  s_first numeric;
  s_close numeric;

  -- The open baskets, planned before the history so that no closed basket
  -- shares a key with one still open.
  ob_key text[] := '{}';
  ob_h numeric[] := '{}';         -- market hours since its first level opened
  ob_first timestamptz[] := '{}';
  xf numeric;           -- how far past the end of the grid the price is, in steps
  fl numeric;
  step numeric;
  sum_a numeric;
  cur numeric;
  worst numeric;
  wh numeric;
  w_time timestamptz;
  float_all numeric := 0;
  margin_now numeric := 0;
  n_open int := 0;

  -- Equity samples.
  ts timestamptz;
  m numeric;
  m_prev numeric;
  f numeric;
  mu numeric;
  last_eq numeric;
  err numeric;
  mb_end numeric;
  ease numeric;

  -- Closed baskets' worst, from the samples.
  cb record;
  w_fl numeric;
  w_at timestamptz;
  w_bal numeric;
  floor_fl numeric;
  floor_at timestamptz;
  floor_bal numeric;
  pk numeric;
  mdd numeric;
  mdd_at timestamptz;
begin
  perform setseed((spec->>'seed')::float8);

  -- The frame.
  wk := date_trunc('week', p_now at time zone 'Europe/London') at time zone 'Europe/London';
  if spec ? 'offline_hours' then
    t_sync := p_now - (spec->>'offline_hours')::numeric * interval '1 hour';
    -- Early on a Monday, 6 hours back is last week: it must have synced
    -- since Monday 00:00 to have a week.
    if t_sync < wk then
      t_sync := wk + (p_now - wk) / 4;
    end if;
  else
    t_sync := p_now;
  end if;
  m_mkt := pg_temp.demo_m(t_sync);
  mkt := pg_temp.demo_t(m_mkt);
  t_end := to_timestamp(floor(extract(epoch from t_sync) / 900) * 900);
  t_start := t_end - interval '30 days';
  we := least(mkt, t_end);
  -- On a Sunday evening the week's trading ended at Friday's close.
  if extract(isodow from we at time zone 'Europe/London') = 7 then
    we := pg_temp.demo_t(floor(pg_temp.demo_m(we) / 432000) * 432000);
  end if;
  m_we := pg_temp.demo_m(we);
  d_today := (we at time zone 'Europe/London')::date;
  mu := -140 * sm;
  f := -120 * sm;

  insert into public.accounts (id, project_id, label)
  select acc, p.id, spec->>'label' from public.projects p where p.slug = spec->>'project';

  -- Plan the open baskets: when each one's first level opened.
  for i in 1..jsonb_array_length(spec->'baskets') loop
    b := spec->'baskets'->(i - 1);
    ob_key := ob_key || ((b->>'sym') || '|' || (b->>'side'));
    ob_h := ob_h || coalesce((b->>'h')::numeric, round((8 + 10 * (b->>'n')::int + random() * 6)::numeric, 1));
    ob_first := ob_first || date_trunc('second', pg_temp.demo_t(m_mkt - ob_h[i] * 3600));
  end loop;

  -- The deposit, on the first weekday 120 days back.
  d0 := d_today - 120;
  d0 := d0 + case extract(isodow from d0) when 6 then 2 when 7 then 1 else 0 end;
  insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
  values (acc, tk::text, null, (d0 + time '07:00') at time zone 'Europe/London', 'balance', 'in', 'cash', null, 0, 0,
          size, 0, 0, 0, size, 0, 'Deposit');
  tk := tk + 1;
  if spec ? 'withdraw' then
    wd := d_today - (spec->>'withdraw_days')::int;
    wd := wd - case extract(isodow from wd) when 6 then 1 when 7 then 2 else 0 end;
  end if;

  for i in reverse 119..1 loop
    day := d_today - i;
    if day = wd then
      insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
      values (acc, tk::text, null, (day + time '17:00') at time zone 'Europe/London', 'balance', 'in', 'cash', null, 0, 0,
              -(spec->>'withdraw')::numeric, 0, 0, 0, -(spec->>'withdraw')::numeric, 0, 'Withdrawal');
      tk := tk + 1;
    end if;
    continue when extract(isodow from day) in (6, 7) or day <= d0;

    if day < (t_start at time zone 'Europe/London')::date + 1 then
      -- Older history: single trades, up to four a day, each closed at the
      -- price its result needs.
      n := floor(random() * 5)::int;
      for k in 1..n loop
        key := keys[1 + floor(random() * 10)::int];
        sym := split_part(key, '|', 1);
        side := split_part(key, '|', 2);
        dir := case when side = 'buy' then 1 else -1 end;
        select * into s from pg_temp.demo_sym(sym);
        pv := round(s.pv / fx, 6);
        vol := greatest(0.01, round((0.05 + random()::numeric * 0.25) * s.lot_scale * sl, 2));
        p_open := round(s.base * (1 + (random()::numeric - 0.5) * 0.02), s.places);
        move := p_open * random() * 0.004 * case when random() < 0.56 then 1 else -1 end;
        p_close := round(p_open + dir * move, s.places);
        pl := round(dir * (p_close - p_open) * pv * vol, 2);
        comm := -round(vol * 3.5 / fx, 2);
        swp := case when random() < 0.2 then -round((random() * 6 * sm)::numeric, 2) else 0 end;
        t_open := (day + time '08:00') at time zone 'Europe/London' + random() * interval '6 hours';
        t_close := t_open + interval '20 minutes' + random() * interval '5 hours';

        insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
        values (acc, tk::text, tk::text, t_open, side, 'in', 'trade', sym, vol, p_open, 0, 0, comm, 0, comm, magic, '');
        insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
        values (acc, (tk + 1)::text, tk::text, t_close, case when side = 'buy' then 'sell' else 'buy' end, 'out', 'trade', sym, vol, p_close,
                pl, swp, comm, 0, pl + swp + comm, magic, case when pl > 0 then 'tp' else 'sl' end);
        tk := tk + 2;
      end loop;
      continue;
    end if;

    -- The last 30 days: on most weekdays one grid basket of 2 to 5
    -- positions, each level further against the trade and bigger, all
    -- closed together when price reverts (now and then at a loss). Never
    -- the key of a basket that is open now and began before this day's
    -- basket would have closed (by 20:00): that would be the same basket.
    continue when random() >= 0.75;
    j := floor(random() * 10)::int;
    for k in 0..9 loop
      key := keys[1 + (j + k) % 10];
      exit when not exists (
        select 1 from unnest(ob_key, ob_first) u (ok, ot)
         where u.ok = key and (day + time '20:00') at time zone 'Europe/London' > u.ot);
    end loop;
    sym := split_part(key, '|', 1);
    side := split_part(key, '|', 2);
    dir := case when side = 'buy' then 1 else -1 end;
    select * into s from pg_temp.demo_sym(sym);
    pv := round(s.pv / fx, 6);
    n := 2 + floor(random() * 4)::int;

    p_open := round(s.base * (1 + (random()::numeric - 0.5) * 0.02), s.places);
    -- Opened by 09:00 and closed by 19:30, so a Friday's basket is closed
    -- before the market is (22:00 London).
    t_open := (day + time '06:00') at time zone 'Europe/London' + random() * interval '3 hours';
    prices := '{}';
    lots := '{}';
    times := '{}';
    for k in 1..n loop
      prices := prices || round(p_open - dir * (k - 1) * s.step, s.places);
      lots := lots || greatest(0.01, round(ladder[k] * s.lot_scale * sl, 2));
      times := times || t_open;
      t_open := t_open + interval '20 minutes' + random() * interval '70 minutes';
    end loop;
    t_close := times[n] + interval '30 minutes' + random() * interval '4 hours';

    -- The close price that makes the basket's profit the target.
    select sum(l), sum(p * l) / sum(l) into sum_lots, wavg from unnest(prices, lots) as u (p, l);
    target := sm * case when random() < 0.9 then 40 + random() * 260 else -(100 + random() * 300) end;
    p_close := round(wavg + dir * (target / pv) / sum_lots, s.places);

    for k in 1..n loop
      vol := lots[k];
      pl := round(dir * (p_close - prices[k]) * pv * vol, 2);
      comm := -round(vol * 3.5 / fx, 2);
      swp := case when random() < 0.2 then -round((random() * 3 * sm)::numeric, 2) else 0 end;
      insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
      values (acc, tk::text, tk::text, times[k], side, 'in', 'trade', sym, vol, prices[k], 0, 0, comm, 0, comm, magic, 'grid ' || k);
      insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
      values (acc, (tk + 1)::text, tk::text, t_close, case when side = 'buy' then 'sell' else 'buy' end, 'out', 'trade', sym, vol, p_close,
              pl, swp, comm, 0, pl + swp + comm, magic, case when target > 0 then 'basket tp' else 'basket stop' end);
      tk := tk + 2;
    end loop;
  end loop;

  -- The balancing basket: the last one closed, inside this London week,
  -- sized so the week comes out at its figure to the cent. It sits in
  -- the last stretch of trading before we, on we's own London day (never
  -- before Monday 00:00 or across a weekend), on a key that is not open.
  -- Its day has no other trades: the history stops the day before.
  select coalesce(sum(d.net), 0) into w_hist from public.deals d
   where d.account_id = acc and d.kind in ('trade', 'other') and d.time >= wk;
  target := week_target - w_hist;
  seg := m_we - greatest(pg_temp.demo_m(wk),
                         pg_temp.demo_m(d_today::timestamp at time zone 'Europe/London'),
                         (ceil(m_we / 432000) - 1) * 432000);
  j := floor(random() * 10)::int;
  for k in 0..9 loop
    key := keys[1 + (j + k) % 10];
    exit when not key = any (ob_key);
  end loop;
  sym := split_part(key, '|', 1);
  side := split_part(key, '|', 2);
  dir := case when side = 'buy' then 1 else -1 end;
  select * into s from pg_temp.demo_sym(sym);
  pv := round(s.pv / fx, 6);
  n := case when seg < 600 then 1 when seg < 7200 then 1 + floor(random() * 2)::int else 2 + floor(random() * 2)::int end;
  s_first := least(seg * 0.8, 18000);
  s_close := least(seg * 0.1, 600);
  -- Lots big enough that the price moves about a grid step and a half.
  select sum(greatest(0.01, round(ladder[g] * s.lot_scale * sl, 2))) into sum_lots from generate_series(1, n) g;
  mult := least(4, greatest(1, abs(target) / (pv * sum_lots * s.step * 1.5)));
  p_open := round(s.base * (1 + (random()::numeric - 0.5) * 0.02), s.places);
  prices := '{}';
  lots := '{}';
  times := '{}';
  comms := '{}';
  for k in 1..n loop
    prices := prices || round(p_open - dir * (k - 1) * s.step, s.places);
    lots := lots || greatest(0.01, round(ladder[k] * s.lot_scale * sl * mult, 2));
    comms := comms || -round(lots[k] * 3.5 / fx, 2);
    times := times || date_trunc('second', we - (s_first - (k - 1) * (s_first - s_close) / n) * interval '1 second');
  end loop;
  t_close := date_trunc('second', we - s_close * interval '1 second');
  select sum(l), sum(p * l) / sum(l) into sum_lots, wavg from unnest(prices, lots) as u (p, l);
  -- Its profit is the target less both sides' commission; what rounding
  -- the price leaves over (under a tick) is the last level's swap.
  p_close := round(wavg + dir * ((target - 2 * (select sum(c) from unnest(comms) c)) / pv) / sum_lots, s.places);
  resid := target;
  for k in 1..n loop
    resid := resid - round(dir * (p_close - prices[k]) * pv * lots[k], 2) - 2 * comms[k];
  end loop;
  for k in 1..n loop
    vol := lots[k];
    pl := round(dir * (p_close - prices[k]) * pv * vol, 2);
    comm := comms[k];
    swp := case when k = n then resid else 0 end;
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
    values (acc, tk::text, tk::text, times[k], side, 'in', 'trade', sym, vol, prices[k], 0, 0, comm, 0, comm, magic, 'grid ' || k);
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
    values (acc, (tk + 1)::text, tk::text, t_close, case when side = 'buy' then 'sell' else 'buy' end, 'out', 'trade', sym, vol, p_close,
            pl, swp, comm, 0, pl + swp + comm, magic, case when target > 0 then 'basket tp' else 'basket stop' end);
    tk := tk + 2;
  end loop;

  select coalesce(sum(d.net), 0) into bal from public.deals d where d.account_id = acc and d.kind <> 'credit';

  -- The closed baskets of the last 30 days, as track_baskets would have
  -- recorded them: the period's positions grouped by symbol, side and the
  -- London day they opened. worst_floating starts as how deep the basket is
  -- made to go (a plausible fraction of a grid step on its whole size),
  -- which shapes the equity samples below; once they are made, its worst
  -- is read back from them.
  insert into public.baskets (account_id, symbol, side, opened_at, first_seen_at, last_seen_at, closed_at,
                              positions, lots, max_positions, max_lots, floating, worst_floating, worst_at, worst_balance, position_ids)
  select acc, x.symbol, x.side, x.opened, x.opened, x.closed, x.closed, x.n, x.lots, x.n, x.lots, 0,
         least(-round(x.lots * (select y.depth from pg_temp.demo_sym(x.symbol) y) / fx * (0.5 + random())::numeric, 2),
               least(x.net, 0) - 10 * sm),
         x.opened + random() * (x.closed - x.opened), null, x.ids
    from (
      select p.symbol, p.side, min(p.open_time) as opened, max(p.close_time) as closed, count(*)::int as n,
             sum(p.volume_in) as lots, sum(p.net) as net, array_agg(p.position_id order by p.position_id) as ids
        from public.account_positions p
       where p.account_id = acc and p.open_time >= t_start
       group by p.symbol, p.side, (p.open_time at time zone 'Europe/London')::date
       order by min(p.open_time)
    ) x;

  -- Floating as at the last sync before the close (profit and swap, no
  -- commission).
  update public.baskets bk set
    floating = (select coalesce(sum(d.profit + d.swap), 0) from public.deals d
                 where d.account_id = acc and d.position_id = any (bk.position_ids))
  where bk.account_id = acc;

  -- The baskets open now. Each is a grid laddered against its side with
  -- growing lots, the first level ob_h market hours ago and the rest
  -- since. Its step is set so that the current price lies part of a step
  -- (xf) past the last level for a basket in loss, or past the first for
  -- one in profit, at the floating it is given; that price then gives each
  -- position's profit, and what rounding leaves over (under a tick) is in
  -- the oldest level's swap. Each position's id is its ticket, and each
  -- carries its point value (account currency per 1.00 of price per lot,
  -- as the EA sends it).
  for i in 1..jsonb_array_length(spec->'baskets') loop
    b := spec->'baskets'->(i - 1);
    sym := b->>'sym';
    side := b->>'side';
    dir := case when side = 'buy' then 1 else -1 end;
    n := (b->>'n')::int;
    fl := (b->>'f')::numeric;
    select * into s from pg_temp.demo_sym(sym);
    pv := round(s.pv / fx, 6);
    xf := coalesce((b->>'x')::numeric, round((0.3 + random() * 0.5)::numeric, 2));
    lots := '{}';
    hours := '{}';
    swaps := '{}';
    for k in 1..n loop
      lots := lots || greatest(0.01, round(ladder[k] * s.lot_scale * sl, 2));
      hours := hours || ob_h[i] * power(1 - (k - 1)::numeric / n, 1.2);
      swaps := swaps || -round(lots[k] * floor(hours[k] / 24) * s.swap / fx, 2);
    end loop;
    select sum(l), sum(case when fl < 0 then l * (n - o) else l * (o - 1) end)
      into sum_lots, sum_a from unnest(lots) with ordinality u (l, o);
    sum_a := sum_a + xf * sum_lots;
    step := greatest(round(abs(fl) / (pv * sum_a), s.places), power(10::numeric, -s.places));
    p_open := round(s.base * (1 + (random()::numeric - 0.5) * 0.02), s.places);
    prices := '{}';
    for k in 1..n loop
      prices := prices || (p_open - dir * (k - 1) * step);
    end loop;
    select sum(p * l) / sum(l) into wavg from unnest(prices, lots) as u (p, l);
    cur := round(wavg + dir * (fl - (select sum(w) from unnest(swaps) w)) / (pv * sum_lots), s.places);
    profits := '{}';
    for k in 1..n loop
      profits := profits || round(dir * (cur - prices[k]) * pv * lots[k], 2);
    end loop;
    swaps[1] := swaps[1] + fl - (select sum(q) from unnest(profits) q) - (select sum(w) from unnest(swaps) w);

    times := '{}';
    for k in 1..n loop
      times := times || date_trunc('second', pg_temp.demo_t(m_mkt - hours[k] * 3600));
      insert into public.open_positions (account_id, ticket, position_id, symbol, side, volume, open_price, current_price,
                                         sl, tp, swap, profit, open_time, magic, comment, updated_at, point_value)
      values (acc, (tk_open + n_open + k)::text, (tk_open + n_open + k)::text, sym, side, lots[k], prices[k], cur,
              0, 0, swaps[k], profits[k], times[k], magic, 'grid ' || k, t_sync, pv);
      margin_now := margin_now + lots[k] * s.contract * cur / fx / least(lev, s.max_lev);
    end loop;

    -- Its tracked row: seen at every sync since it opened, the last one
    -- t_sync. Its worst: as given, or a little deeper than now for one in
    -- loss and a fraction of a step on its size for one in profit, part
    -- way through its life after the last level.
    worst := coalesce((b->>'worst')::numeric,
                      case when fl < 0 then round(fl * (1.15 + 0.25 * random())::numeric, 2)
                           else -round(sum_lots * pv * step * (0.3 + 0.4 * random())::numeric, 2) end);
    wh := coalesce((b->>'wh')::numeric, greatest(0.5, round((hours[n] * (0.3 + 0.4 * random()))::numeric, 1)));
    w_time := date_trunc('second', pg_temp.demo_t(m_mkt - wh * 3600));
    insert into public.baskets (account_id, symbol, side, opened_at, first_seen_at, last_seen_at, closed_at,
                                positions, lots, max_positions, max_lots, floating, worst_floating, worst_at, worst_balance, position_ids)
    values (acc, sym, side, times[1], times[1], t_sync, null, n, sum_lots, n, sum_lots, fl, worst, w_time,
            (select coalesce(sum(d.net), 0) from public.deals d where d.account_id = acc and d.kind <> 'credit' and d.time <= w_time),
            array(select (tk_open + n_open + g)::text from generate_series(1, n) g));
    n_open := n_open + n;
    float_all := float_all + fl;
  end loop;
  margin_now := round(margin_now, 2);

  -- Equity samples every 15 minutes for 30 days: balance from the deals,
  -- plus a floating P&L that reverts to a mean below zero (AR(1), phi
  -- 0.97), with now and then a dip that works its way back. It moves in
  -- market time only: still while markets are shut, and after the last
  -- close. The equity column holds that floating for now.
  for ts in select gs from generate_series(t_start, t_end, interval '15 minutes') gs loop
    m := pg_temp.demo_m(ts);
    if m_prev is null or m > m_prev then
      f := mu + 0.97 * (f - mu) + (random() + random() + random() - 1.5) * 30 * sm;
      if random() < 0.003 then
        f := f - (250 + random() * 550) * sm;
      end if;
    end if;
    m_prev := m;
    insert into public.equity_samples (account_id, at, balance, equity) values (acc, ts, 0, f);
  end loop;

  -- On top of it, each closed basket's own path, down to its depth and back
  -- to what it closed at, and each open basket's slide to its worst and on
  -- to its floating now, in market time. The balance is a running sum of
  -- the deals. The CTEs are materialized so each is worked out once: the
  -- rows were inserted in this transaction and have no statistics yet, and
  -- a planner left to guess can re-run nv once per sample.
  with ev as (
    select d.time as t, 0 as o, d.net from public.deals d where d.account_id = acc and d.kind <> 'credit'
    union all
    select es.at, 1, 0 from public.equity_samples es where es.account_id = acc
  ), run as materialized (
    select ev.t, ev.o, sum(ev.net) over (order by ev.t, ev.o rows between unbounded preceding and current row) as b
      from ev
  ), ob as materialized (
    select x2.worst_floating as worst, x2.floating as fl,
           m_mkt - pg_temp.demo_m(x2.opened_at) as h, m_mkt - pg_temp.demo_m(x2.worst_at) as hw
      from public.baskets x2 where x2.account_id = acc and x2.closed_at is null
  ), sv as (
    select es.at, r.b, es.equity as f, m_mkt - pg_temp.demo_m(es.at) as mb
      from public.equity_samples es
      join run r on r.t = es.at and r.o = 1
     where es.account_id = acc
  ), nv as materialized (
    select sv.at, sv.b,
           sv.f
           + coalesce((select sum(case when sv.mb >= ob.h then 0
                                       when sv.mb > ob.hw then ob.worst * power((ob.h - sv.mb) / (ob.h - ob.hw), 1.5)
                                       else ob.worst + (ob.fl - ob.worst) * (ob.hw - sv.mb) / ob.hw end)
                         from ob), 0)
           + coalesce((select sum(c.worst_floating * sin(pi() * c.u)::numeric + c.floating * power(c.u, 3))
                         from (select x3.worst_floating, x3.floating,
                                      extract(epoch from sv.at - x3.opened_at) / extract(epoch from x3.closed_at - x3.opened_at) as u
                                 from public.baskets x3
                                where x3.account_id = acc and x3.closed_at is not null
                                  and x3.opened_at <= sv.at and sv.at < x3.closed_at) c), 0) as fl
      from sv
  )
  update public.equity_samples es set balance = nv.b, equity = round(nv.b + nv.fl, 2)
    from nv where es.account_id = acc and es.at = nv.at;

  -- Eased over the last 24 market hours, so the last sample (and every one
  -- after the last close) is exactly the account's equity now.
  mb_end := m_mkt - pg_temp.demo_m(t_end);
  select es.equity into last_eq from public.equity_samples es where es.account_id = acc and es.at = t_end;
  err := bal + float_all - last_eq;
  -- Never back into a closed basket's life, whose worst is read from these
  -- samples below: at most the market time since the last one closed.
  ease := least(86400, greatest(900, m_mkt - coalesce(
            (select pg_temp.demo_m(max(b2.closed_at)) from public.baskets b2
              where b2.account_id = acc and b2.closed_at is not null), m_mkt - 86400)));
  update public.equity_samples es
     set equity = round(es.equity + err * greatest(0, 1 - (x.mb - mb_end) / ease), 2)
    from (select s2.at, m_mkt - pg_temp.demo_m(s2.at) as mb
            from public.equity_samples s2 where s2.account_id = acc and s2.at > t_end - interval '5 days') x
   where es.account_id = acc and es.at = x.at and x.mb - mb_end < ease;

  -- Each closed basket's worst is read back from the samples inside its
  -- life: its own path at the lowest of them (as track_baskets would have
  -- seen it at a sync), with that sample's time and balance. Never deeper
  -- than the account's own floating went in the samples then, so the
  -- table never shows a drawdown the equity chart does not; it can be
  -- shallower, when another basket was deeper still. If its path never
  -- goes below zero there, a small loss for its size (5 a lot, at least
  -- 0.50), at the start of its life; if even that is deeper than the chart
  -- went (the chart above zero throughout), the chart's lowest.
  for cb in select x4.id, x4.opened_at, x4.closed_at, x4.max_lots, x4.worst_floating as depth, x4.floating
              from public.baskets x4 where x4.account_id = acc and x4.closed_at is not null loop
    w_at := null;
    select y.p, y.at, y.balance into w_fl, w_at, w_bal
      from (
        select es.at, es.balance,
               cb.depth * sin(pi() * u.u)::numeric + cb.floating * power(u.u, 3) as p
          from public.equity_samples es,
               lateral (select extract(epoch from es.at - cb.opened_at) / extract(epoch from cb.closed_at - cb.opened_at) as u) u
         where es.account_id = acc and es.at >= cb.opened_at and es.at < cb.closed_at
      ) y
     order by y.p, y.at
     limit 1;
    if w_at is null or w_fl >= 0 then
      w_fl := -round(greatest(0.5, 5 * cb.max_lots), 2);
      if w_at is null then
        -- A basket too short for a sample inside it: seen once, as it opened.
        w_at := cb.opened_at;
        select coalesce(sum(d.net), 0) into w_bal from public.deals d
         where d.account_id = acc and d.kind <> 'credit' and d.time <= cb.opened_at;
      end if;
    end if;
    floor_fl := null;
    select es.equity - es.balance, es.at, es.balance into floor_fl, floor_at, floor_bal
      from public.equity_samples es
     where es.account_id = acc and es.at between cb.opened_at and cb.closed_at
     order by es.equity - es.balance, es.at
     limit 1;
    if floor_fl is not null and w_fl < floor_fl then
      w_fl := floor_fl;
      w_at := floor_at;
      w_bal := floor_bal;
    end if;
    -- Never above what it closed at: the last sync before the close saw that.
    if w_fl > cb.floating then
      w_fl := cb.floating;
      w_at := cb.closed_at;
      select coalesce(sum(d.net), 0) into w_bal from public.deals d
       where d.account_id = acc and d.kind <> 'credit' and d.time < cb.closed_at;
    end if;
    update public.baskets set worst_floating = round(w_fl, 2), worst_at = w_at, worst_balance = w_bal where id = cb.id;
  end loop;

  -- The same for the open ones: never deeper than the chart went while
  -- they were open (the last sample is the floating now, so this never
  -- lifts a worst above its basket's floating).
  for cb in select x5.id, x5.opened_at, x5.worst_floating, x5.floating
              from public.baskets x5 where x5.account_id = acc and x5.closed_at is null loop
    floor_fl := null;
    select es.equity - es.balance, es.at, es.balance into floor_fl, floor_at, floor_bal
      from public.equity_samples es
     where es.account_id = acc and es.at >= cb.opened_at
     order by es.equity - es.balance, es.at
     limit 1;
    if floor_fl is not null and cb.worst_floating < floor_fl then
      update public.baskets
         set worst_floating = round(least(floor_fl, cb.floating), 2), worst_at = floor_at, worst_balance = floor_bal
       where id = cb.id;
    end if;
  end loop;

  -- Peak and max drawdown as the syncs would have tracked them from the
  -- samples (no money moved in or out in these 30 days).
  select max(es.equity) into pk from public.equity_samples es where es.account_id = acc;
  select y.dd, y.at into mdd, mdd_at
    from (
      select es.at, (max(es.equity) over (order by es.at) - es.equity) / max(es.equity) over (order by es.at) as dd
        from public.equity_samples es where es.account_id = acc
    ) y
   order by y.dd desc, y.at
   limit 1;

  update public.accounts set
    account_number = (90000000 + (spec->>'n')::int)::text,
    server = 'Demo-Server',
    broker = 'Sample data, not a real account',
    currency = ccy,
    leverage = lev,
    ea_version = '2026.10.17.5',
    last_sync_at = t_sync,
    open_snapshot_at = t_sync,
    balance = bal,
    equity = bal + float_all,
    credit = 0,
    margin = margin_now,
    free_margin = bal + float_all - margin_now,
    margin_level = case when margin_now > 0 then round((bal + float_all) / margin_now * 100, 2) else 0 end,
    open_positions = n_open,
    floating_pnl = float_all,
    stop_out_mode = 'percent',
    margin_call_level = (spec->>'mc')::numeric,
    stop_out_level = (spec->>'so')::numeric,
    tracking_since = t_start,
    peak_equity = greatest(pk, bal + float_all),
    max_drawdown_pct = round(mdd, 4),
    max_drawdown_at = mdd_at,
    last_sample_at = t_end
  where id = acc;
end
$demo$;

-- The accounts. n gives the id's last digit, the account number
-- (9000000n) and the ticket range; week is this week's realised P&L; f is
-- each open basket's floating now. Optional per basket: h (market hours
-- since its first level), x (part of a step the price is past the end of
-- the grid), worst and wh (its worst floating so far, wh market hours
-- ago). d001's are set so it reads as it always has.
select pg_temp.demo_account(spec, now())
  from jsonb_array_elements($specs$[
  {"n": 1, "id": "d0000000-0000-4000-8000-00000000d001", "project": "v100", "label": "DEMO · Test account · 50k",
   "ccy": "USD", "fx": 1, "size": 50000, "lev": 500, "mc": 100, "so": 50, "week": 500, "seed": 0.4242, "magic": 2026,
   "withdraw": 3000, "withdraw_days": 45,
   "baskets": [
     {"sym": "XAUUSD", "side": "buy", "n": 6, "f": -1848.90, "h": 70, "x": 0.78, "worst": -2300.00, "wh": 3},
     {"sym": "EURUSD", "side": "sell", "n": 3, "f": -95.60, "h": 20, "worst": -128.40, "wh": 2},
     {"sym": "NAS100", "side": "buy", "n": 2, "f": 60.00, "h": 9, "x": 0.5, "worst": -35.20, "wh": 6}]},
  {"n": 2, "id": "d0000000-0000-4000-8000-00000000d002", "project": "v100", "label": "DEMO · V100 · 100k",
   "ccy": "USD", "fx": 1, "size": 100000, "lev": 500, "mc": 100, "so": 50, "week": 1850, "seed": 0.1313, "magic": 2026,
   "withdraw": 5000, "withdraw_days": 60,
   "baskets": [
     {"sym": "GBPUSD", "side": "buy", "n": 4, "f": -320.00},
     {"sym": "US30", "side": "sell", "n": 3, "f": -150.00},
     {"sym": "XAUUSD", "side": "sell", "n": 2, "f": 85.00}]},
  {"n": 3, "id": "d0000000-0000-4000-8000-00000000d003", "project": "v100", "label": "DEMO · V100 · 25k",
   "ccy": "USD", "fx": 1, "size": 25000, "lev": 500, "mc": 100, "so": 50, "week": -420, "seed": 0.2468, "magic": 2026,
   "baskets": [
     {"sym": "EURUSD", "side": "buy", "n": 4, "f": -600.00},
     {"sym": "NAS100", "side": "sell", "n": 2, "f": -45.00}]},
  {"n": 4, "id": "d0000000-0000-4000-8000-00000000d004", "project": "v100", "label": "DEMO · V100 · 10k",
   "ccy": "USD", "fx": 1, "size": 10000, "lev": 500, "mc": 100, "so": 50, "week": 140, "seed": 0.3579, "magic": 2026,
   "baskets": []},
  {"n": 5, "id": "d0000000-0000-4000-8000-00000000d005", "project": "cycle-method", "label": "DEMO · Cycle · 30k GBP",
   "ccy": "GBP", "fx": 1.27, "size": 30000, "lev": 200, "mc": 100, "so": 30, "week": 740, "seed": 0.4680, "magic": 3100,
   "withdraw": 1500, "withdraw_days": 40,
   "baskets": [
     {"sym": "XAUUSD", "side": "sell", "n": 4, "f": -520.00},
     {"sym": "GBPUSD", "side": "buy", "n": 2, "f": -95.00}]},
  {"n": 6, "id": "d0000000-0000-4000-8000-00000000d006", "project": "cycle-method", "label": "DEMO · Cycle · 75k",
   "ccy": "USD", "fx": 1, "size": 75000, "lev": 500, "mc": 80, "so": 40, "week": 1200, "seed": 0.5791, "magic": 3100,
   "baskets": [
     {"sym": "US30", "side": "buy", "n": 7, "f": -3900.00},
     {"sym": "EURUSD", "side": "sell", "n": 2, "f": -80.00}]},
  {"n": 7, "id": "d0000000-0000-4000-8000-00000000d007", "project": "cycle-method", "label": "DEMO · Cycle · 20k",
   "ccy": "USD", "fx": 1, "size": 20000, "lev": 500, "mc": 100, "so": 50, "week": 610, "seed": 0.6802, "magic": 3100,
   "offline_hours": 6,
   "baskets": [
     {"sym": "XAUUSD", "side": "buy", "n": 3, "f": -240.00}]}
  ]$specs$::jsonb) as t (spec);

-- The new account: made on the admin screen, its EA never attached.
insert into public.accounts (id, project_id, label)
select 'd0000000-0000-4000-8000-00000000d008', p.id, 'DEMO · Cycle · new account'
  from public.projects p where p.slug = 'cycle-method';

drop function pg_temp.demo_account(jsonb, timestamptz);
drop function pg_temp.demo_sym(text);
drop function pg_temp.demo_t(numeric);
drop function pg_temp.demo_m(timestamptz);

-- What was made.
select a.label, a.currency, a.balance, a.equity, a.open_positions, a.last_sync_at
  from public.accounts a
 where a.id::text like 'd0000000-0000-4000-8000-00000000d00_'
 order by a.id;
