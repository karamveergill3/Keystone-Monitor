-- DEMO ACCOUNT: sample data so the site has something to show before a real
-- terminal is connected. Run it in the Supabase SQL editor, after
-- schema.sql; it is safe to run again (it replaces itself). It adds
-- "DEMO · Test account · 50k" to V100, set up like a mean reversion grid
-- account: a $50,000 deposit, about four months of weekday trades (the last
-- 30 days as grid baskets, each closed together), a $3,000 withdrawal, 30
-- days of 15-minute equity samples, and three grid baskets open now. The
-- gold buy basket's floating loss is more than the week's realised profit,
-- so it is not marked closable; the EURUSD sell basket's small loss is
-- less, so it is marked closable (green) on most days it is run.
-- Nothing in it is a real account.
--
-- MARKET TIME. Markets are shut from Friday 22:00 to Sunday 22:00, London.
-- Run at a weekend, everything that moves with the market (the open
-- positions' and baskets' times, the gold slide, the equity dips) ends at
-- the last close and floating stays flat after it; only the sync times
-- (last_sync_at, last_seen_at, updated_at) are now. Offsets such as "70
-- hours ago" are market hours, so no position opens while markets are shut.
--
-- TO REMOVE IT (deals, samples, positions and baskets go with it):
--   delete from public.accounts where id = 'd0000000-0000-4000-8000-00000000d001';
-- Or archive it from the admin screen to hide it and keep the data.

do $demo$
declare
  acc uuid := 'd0000000-0000-4000-8000-00000000d001';
  proj uuid;
  day date;
  k int;
  n int;
  t_open timestamptz;
  t_close timestamptz;
  vol numeric;
  p_open numeric;
  p_close numeric;
  pl numeric;
  comm numeric;
  swp numeric;
  sym text;
  side text;
  base numeric;
  places int;
  tk bigint := 7000000;
  bal numeric;
  syms text[] := array['XAUUSD', 'EURUSD', 'GBPUSD', 'US30', 'NAS100'];

  -- Grid baskets.
  ladder numeric[] := array[0.10, 0.10, 0.15, 0.20, 0.30];
  dir int;
  step numeric;
  vpp numeric;          -- account currency per 1.00 of price per lot
  lot_scale numeric;
  prices numeric[];
  lots numeric[];
  times timestamptz[];
  sum_lots numeric;
  wavg numeric;
  target numeric;

  -- Equity samples.
  ts timestamptz;
  t_start timestamptz;
  t_end timestamptz;
  f numeric := -120;
  mu numeric := -140;
  g numeric;
  b numeric;
  t_gold timestamptz;
  t_worst timestamptz;
  last_eq numeric;
  err numeric;
  path numeric;
  mb numeric;           -- market seconds from a sample to mkt
  mb_end numeric;

  -- Market time (see MARKET TIME above).
  lnow timestamp := now() at time zone 'Europe/London';
  w_open timestamptz;   -- the Sunday 22:00 that opened this market week (the last one, at a weekend)
  w_close timestamptz;  -- the Friday 22:00 that closes it
  prev_close timestamptz; -- the Friday 22:00 before w_open
  mkt timestamptz;      -- now, or the last close at a weekend
  span numeric;         -- market seconds from w_open to mkt
  ago timestamptz[];    -- ago[h]: h market hours before mkt, for h = 1..70

  -- Closed baskets' worst, from the samples.
  cb record;
  w_fl numeric;
  w_at timestamptz;
  w_bal numeric;
  floor_fl numeric;
  floor_at timestamptz;
  floor_bal numeric;

  -- The open baskets, as the terminal reports them now.
  float_gold numeric := -1848.90;
  float_eur numeric := -95.60;
  float_nas numeric := 60.00;
  float_all numeric := -1884.50;
  margin_now numeric := 1239.41;
  pk numeric;
  mdd numeric;
  mdd_at timestamptz;
begin
  select id into proj from public.projects where slug = 'v100';
  delete from public.accounts where id = acc;
  perform setseed(0.4242);

  -- The market week, Sunday 22:00 to Friday 22:00 London. Two hours on,
  -- date_trunc('week') gives the Monday of the week a Sunday evening
  -- already belongs to; at a weekend, the week that has just closed.
  w_open := (date_trunc('week', lnow + interval '2 hours') - interval '2 hours') at time zone 'Europe/London';
  w_close := (date_trunc('week', lnow + interval '2 hours') + interval '4 days 22 hours') at time zone 'Europe/London';
  prev_close := (date_trunc('week', lnow + interval '2 hours') - interval '2 days 2 hours') at time zone 'Europe/London';
  mkt := least(now(), w_close);
  span := extract(epoch from mkt - w_open);
  -- Never more than 70 hours back, so at most one weekend is crossed.
  select array_agg(case when h * 3600 <= span then mkt - h * interval '1 hour'
                        else prev_close - (h * 3600 - span) * interval '1 second' end order by h)
    into ago from generate_series(1, 70) h;
  t_gold := ago[70];
  t_worst := ago[3];

  insert into public.accounts (id, project_id, label) values (acc, proj, 'DEMO · Test account · 50k');

  insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
  values (acc, tk::text, null, date_trunc('day', now()) - interval '120 days' + interval '8 hours', 'balance', 'in', 'cash', null, 0, 0, 50000, 0, 0, 0, 50000, 0, 'Deposit');
  tk := tk + 1;

  for day in select gs::date from generate_series(current_date - 119, current_date - 1, interval '1 day') gs loop
    continue when extract(isodow from day) in (6, 7);

    if day < current_date - 29 then
      -- Older history: single trades, up to four a day.
      n := floor(random() * 5)::int;
      for k in 1..n loop
        sym := syms[1 + floor(random() * 5)::int];
        side := case when random() < 0.5 then 'buy' else 'sell' end;
        base := case sym when 'XAUUSD' then 2650 when 'US30' then 42000 when 'NAS100' then 20000 when 'GBPUSD' then 1.27 else 1.08 end;
        places := case when base < 10 then 5 else 2 end;
        vol := round((0.1 + random() * 1.4)::numeric, 2);
        p_open := round((base * (1 + (random() - 0.5) * 0.02))::numeric, places);
        pl := round(((random() - 0.44) * 420)::numeric, 2);
        p_close := round((p_open * (1 + (case when side = 'buy' then 1 else -1 end) * sign(pl) * random() * 0.004))::numeric, places);
        comm := -round((vol * 3.5)::numeric, 2);
        swp := case when random() < 0.2 then -round((random() * 6)::numeric, 2) else 0 end;
        t_open := day + time '08:00' + random() * interval '6 hours';
        t_close := t_open + interval '20 minutes' + random() * interval '5 hours';

        insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
        values (acc, tk::text, tk::text, t_open, side, 'in', 'trade', sym, vol, p_open, 0, 0, comm, 0, comm, 2026, '');
        insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
        values (acc, (tk + 1)::text, tk::text, t_close, case when side = 'buy' then 'sell' else 'buy' end, 'out', 'trade', sym, vol, p_close,
                pl, swp, comm, 0, pl + swp + comm, 2026, case when pl > 0 then 'tp' else 'sl' end);
        tk := tk + 2;
      end loop;
      continue;
    end if;

    -- The last 30 days: on most weekdays one grid basket of 2 to 5
    -- positions, each level further against the trade and bigger, all
    -- closed together when price reverts (now and then at a loss).
    continue when random() >= 0.75;
    sym := syms[1 + floor(random() * 5)::int];
    side := case when random() < 0.5 then 'buy' else 'sell' end;
    -- Never the key of a basket that is open now and began before this
    -- day's basket would have closed (by 20:00): that would be the same
    -- basket. The gold basket opened first of the three.
    if day + time '20:00' > t_gold and (sym, side) in (('XAUUSD', 'buy'), ('EURUSD', 'sell'), ('NAS100', 'buy')) then
      side := case when side = 'buy' then 'sell' else 'buy' end;
    end if;
    dir := case when side = 'buy' then 1 else -1 end;
    base := case sym when 'XAUUSD' then 2650 when 'US30' then 42000 when 'NAS100' then 20000 when 'GBPUSD' then 1.27 else 1.08 end;
    places := case when base < 10 then 5 else 2 end;
    step := case sym when 'XAUUSD' then 5 when 'US30' then 60 when 'NAS100' then 25 when 'GBPUSD' then 0.0015 else 0.0012 end;
    vpp := case sym when 'XAUUSD' then 100 when 'US30' then 1 when 'NAS100' then 1 else 100000 end;
    lot_scale := case sym when 'XAUUSD' then 1 when 'US30' then 10 when 'NAS100' then 10 else 3 end;
    n := 2 + floor(random() * 4)::int;

    p_open := round((base * (1 + (random() - 0.5) * 0.02))::numeric, places);
    -- Opened by 09:00 and closed by 19:30, so a Friday's basket is closed
    -- before the market is (22:00 London).
    t_open := day + time '06:00' + random() * interval '3 hours';
    prices := '{}';
    lots := '{}';
    times := '{}';
    for k in 1..n loop
      prices := prices || round(p_open - dir * (k - 1) * step, places);
      lots := lots || round(ladder[k] * lot_scale, 2);
      times := times || t_open;
      t_open := t_open + interval '20 minutes' + random() * interval '70 minutes';
    end loop;
    t_close := times[n] + interval '30 minutes' + random() * interval '4 hours';

    -- The close price that makes the basket's profit the target.
    select sum(l), sum(p * l) / sum(l) into sum_lots, wavg from unnest(prices, lots) as u (p, l);
    target := case when random() < 0.9 then 40 + random() * 260 else -(100 + random() * 300) end;
    p_close := round(wavg + dir * (target / vpp) / sum_lots, places);

    for k in 1..n loop
      vol := lots[k];
      pl := round(dir * (p_close - prices[k]) * vpp * vol, 2);
      comm := -round((vol * 3.5)::numeric, 2);
      swp := case when random() < 0.2 then -round((random() * 3)::numeric, 2) else 0 end;
      insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
      values (acc, tk::text, tk::text, times[k], side, 'in', 'trade', sym, vol, prices[k], 0, 0, comm, 0, comm, 2026, 'grid ' || k);
      insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
      values (acc, (tk + 1)::text, tk::text, t_close, case when side = 'buy' then 'sell' else 'buy' end, 'out', 'trade', sym, vol, p_close,
              pl, swp, comm, 0, pl + swp + comm, 2026, case when target > 0 then 'basket tp' else 'basket stop' end);
      tk := tk + 2;
    end loop;
  end loop;

  insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
  values (acc, tk::text, null, date_trunc('day', now()) - interval '45 days' + interval '17 hours', 'balance', 'in', 'cash', null, 0, 0, -3000, 0, 0, 0, -3000, 0, 'Withdrawal');
  tk := tk + 1;

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
         least(
           -round(x.lots * (case x.symbol when 'XAUUSD' then 500 when 'US30' then 60 when 'NAS100' then 25 when 'GBPUSD' then 150 else 120 end)
                  * (0.5 + random())::numeric, 2),
           least(x.net, 0) - 10),
         x.opened + random() * (x.closed - x.opened), null, x.ids
    from (
      select p.symbol, p.side, min(p.open_time) as opened, max(p.close_time) as closed, count(*)::int as n,
             sum(p.volume_in) as lots, sum(p.net) as net, array_agg(p.position_id order by p.position_id) as ids
        from public.account_positions p
       where p.account_id = acc and (p.open_time at time zone 'Europe/London')::date >= current_date - 29
       group by p.symbol, p.side, (p.open_time at time zone 'Europe/London')::date
       order by min(p.open_time)
    ) x;

  -- Floating as at the last sync before the close (profit and swap, no
  -- commission).
  update public.baskets bk set
    floating = (select coalesce(sum(d.profit + d.swap), 0) from public.deals d
                 where d.account_id = acc and d.position_id = any (bk.position_ids))
  where bk.account_id = acc;

  -- Three grid baskets open now, each position's id its ticket, and each
  -- with its symbol's point value (account currency per 1.00 of price per
  -- lot, as the EA sends it): 100, 100,000 and 1.
  --   XAUUSD buy: six levels $6 apart from 2668, lots growing, price now
  --     2633.30. $100 per $1 per lot: -1,841.00 profit, -7.90 swap.
  --   EURUSD sell: three levels 15 pips apart, price now 1.08608. $10 per
  --     pip per lot: -95.60.
  --   NAS100 buy: two levels 30 points apart, price now 20135. $1 per point
  --     per lot: +60.00.
  insert into public.open_positions (account_id, ticket, position_id, symbol, side, volume, open_price, current_price, sl, tp, swap, profit, open_time, magic, comment, updated_at, point_value) values
    (acc, '7999001', '7999001', 'XAUUSD', 'buy', 0.10, 2668.00, 2633.30, 0, 0, -2.30, -347.00, ago[70], 2026, 'grid 1', now(), 100),
    (acc, '7999002', '7999002', 'XAUUSD', 'buy', 0.10, 2662.00, 2633.30, 0, 0, -1.90, -287.00, ago[58], 2026, 'grid 2', now(), 100),
    (acc, '7999003', '7999003', 'XAUUSD', 'buy', 0.15, 2656.00, 2633.30, 0, 0, -1.60, -340.50, ago[46], 2026, 'grid 3', now(), 100),
    (acc, '7999004', '7999004', 'XAUUSD', 'buy', 0.20, 2650.00, 2633.30, 0, 0, -1.20, -334.00, ago[30], 2026, 'grid 4', now(), 100),
    (acc, '7999005', '7999005', 'XAUUSD', 'buy', 0.30, 2644.00, 2633.30, 0, 0, -0.90, -321.00, ago[16], 2026, 'grid 5', now(), 100),
    (acc, '7999006', '7999006', 'XAUUSD', 'buy', 0.45, 2638.00, 2633.30, 0, 0, 0, -211.50, ago[5], 2026, 'grid 6', now(), 100),
    (acc, '7999007', '7999007', 'EURUSD', 'sell', 0.20, 1.08300, 1.08608, 0, 0, 0, -61.60, ago[20], 2026, 'grid 1', now(), 100000),
    (acc, '7999008', '7999008', 'EURUSD', 'sell', 0.20, 1.08450, 1.08608, 0, 0, 0, -31.60, ago[12], 2026, 'grid 2', now(), 100000),
    (acc, '7999009', '7999009', 'EURUSD', 'sell', 0.30, 1.08600, 1.08608, 0, 0, 0, -2.40, ago[6], 2026, 'grid 3', now(), 100000),
    (acc, '7999010', '7999010', 'NAS100', 'buy', 1.00, 20120.00, 20135.00, 0, 0, 0, 15.00, ago[9], 2026, 'grid 1', now(), 1),
    (acc, '7999011', '7999011', 'NAS100', 'buy', 1.00, 20090.00, 20135.00, 0, 0, 0, 45.00, ago[4], 2026, 'grid 2', now(), 1);

  -- Their baskets. Gold was at its deepest 3 market hours ago, at -2,300.
  -- Seen at every sync since they opened, the last one now.
  insert into public.baskets (account_id, symbol, side, opened_at, first_seen_at, last_seen_at, closed_at,
                              positions, lots, max_positions, max_lots, floating, worst_floating, worst_at, worst_balance, position_ids) values
    (acc, 'XAUUSD', 'buy', t_gold, t_gold, now(), null, 6, 1.30, 6, 1.30, float_gold, -2300.00, t_worst, bal,
     array['7999001', '7999002', '7999003', '7999004', '7999005', '7999006']),
    (acc, 'EURUSD', 'sell', ago[20], ago[20], now(), null, 3, 0.70, 3, 0.70, float_eur, -128.40,
     ago[2], bal, array['7999007', '7999008', '7999009']),
    (acc, 'NAS100', 'buy', ago[9], ago[9], now(), null, 2, 2.00, 2, 2.00, float_nas, -35.20,
     ago[6], bal, array['7999010', '7999011']);

  -- Equity samples every 15 minutes for 30 days: balance from the deals,
  -- plus a floating P&L that reverts to a mean below zero (AR(1), phi
  -- 0.97), with now and then a dip of several hundred dollars that works
  -- its way back. On top of it, each closed basket's own path, down to its
  -- depth and back to what it closed at, and the open gold basket's slide
  -- to its worst and part recovery over its 70 market hours. The last
  -- market day is eased onto today's equity. All of it moves in market
  -- time only: still while markets are shut, and flat after the last close.
  t_end := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  t_start := t_end - interval '30 days';
  for ts in select gs from generate_series(t_start, t_end, interval '15 minutes') gs loop
    if not (extract(isodow from ts at time zone 'Europe/London') = 6
            or (extract(isodow from ts at time zone 'Europe/London') = 5 and (ts at time zone 'Europe/London')::time >= time '22:00')
            or (extract(isodow from ts at time zone 'Europe/London') = 7 and (ts at time zone 'Europe/London')::time < time '22:00')
            or ts > mkt) then
      f := mu + 0.97 * (f - mu) + (random() + random() + random() - 1.5) * 30;
      if random() < 0.003 then
        f := f - (250 + random() * 550);
      end if;
    end if;
    -- Market seconds from ts to mkt (0 after it).
    mb := case
      when ts >= mkt then 0
      when ts >= w_open then extract(epoch from mkt - ts)
      when ts >= prev_close then span
      else span + extract(epoch from prev_close - ts)
    end;
    g := case
      when mb >= 70 * 3600 then 0
      when mb > 3 * 3600 then -2300 * power((70 * 3600 - mb) / (67 * 3600), 1.5)
      else -2300 + (2300 + float_gold) * (3 * 3600 - mb) / (3 * 3600)
    end;
    -- A closed basket, within its one trading day: worst_floating (its
    -- depth for now) halfway, and its closing floating at the end.
    select coalesce(sum(
             bk2.worst_floating * sin(pi() * u) + bk2.floating * power(u, 3)), 0)
      into path
      from (select x.worst_floating, x.floating,
                   extract(epoch from ts - x.opened_at) / extract(epoch from x.closed_at - x.opened_at) as u
              from public.baskets x
             where x.account_id = acc and x.closed_at is not null
               and x.opened_at <= ts and ts < x.closed_at) bk2;
    select coalesce(sum(d.net), 0) into b from public.deals d
     where d.account_id = acc and d.time <= ts and d.kind <> 'credit';
    insert into public.equity_samples (account_id, at, balance, equity)
    values (acc, ts, b, round(b + f + g + path, 2));
  end loop;

  -- Eased over the last 24 market hours, so the last sample (and every one
  -- after the last close) is exactly today's equity.
  mb_end := case when t_end >= mkt then 0 else extract(epoch from mkt - t_end) end;
  select es.equity into last_eq from public.equity_samples es where es.account_id = acc and es.at = t_end;
  err := bal + float_all - last_eq;
  update public.equity_samples es
     set equity = round(es.equity + err * greatest(0, 1 - (x.mb - mb_end) / 86400.0), 2)
    from (
      select s2.at,
             case
               when s2.at >= mkt then 0
               when s2.at >= w_open then extract(epoch from mkt - s2.at)
               when s2.at >= prev_close then span
               else span + extract(epoch from prev_close - s2.at)
             end as mb
        from public.equity_samples s2 where s2.account_id = acc
    ) x
   where es.account_id = acc and es.at = x.at and x.mb - mb_end < 86400;

  -- Each closed basket's worst is read back from the samples inside its
  -- life: its own path at the lowest of them (as track_baskets would have
  -- seen it at a sync), with that sample's time and balance. Never deeper
  -- than the account's own floating went in the samples then, so the
  -- table never shows a drawdown the equity chart does not; it can be
  -- shallower, when another basket (the open gold one, say) was deeper
  -- still. If its path never goes below zero there, a small loss for its
  -- size ($5 a lot, at least 0.50), at the start of its life; if even that
  -- is deeper than the chart went (the chart above zero throughout), the
  -- chart's lowest.
  for cb in select x.id, x.opened_at, x.closed_at, x.max_lots, x.worst_floating as depth, x.floating
              from public.baskets x where x.account_id = acc and x.closed_at is not null loop
    w_at := null;
    select y.p, y.at, y.balance into w_fl, w_at, w_bal
      from (
        select es.at, es.balance,
               cb.depth * sin(pi() * u.u) + cb.floating * power(u.u, 3) as p
          from public.equity_samples es,
               lateral (select extract(epoch from es.at - cb.opened_at) / extract(epoch from cb.closed_at - cb.opened_at) as u) u
         where es.account_id = acc and es.at >= cb.opened_at and es.at < cb.closed_at
      ) y
     order by y.p, y.at
     limit 1;
    if w_at is null or w_fl >= 0 then
      w_fl := -round(greatest(0.5, 5 * cb.max_lots), 2);
      if w_at is null then
        select es.at, es.balance into w_at, w_bal from public.equity_samples es
         where es.account_id = acc and es.at >= cb.opened_at order by es.at limit 1;
      end if;
    end if;
    -- Deeper than the chart went: the chart's lowest, where it was.
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
    w_fl := round(w_fl, 2);
    update public.baskets set worst_floating = w_fl, worst_at = w_at, worst_balance = w_bal where id = cb.id;
  end loop;

  -- Peak and max drawdown as the syncs would have tracked them from the
  -- samples (no money moved in or out in these 30 days).
  select max(es.equity) into pk from public.equity_samples es where es.account_id = acc;
  select x.dd, x.at into mdd, mdd_at
    from (
      select es.at, (max(es.equity) over (order by es.at) - es.equity) / max(es.equity) over (order by es.at) as dd
        from public.equity_samples es where es.account_id = acc
    ) x
   order by x.dd desc, x.at
   limit 1;

  update public.accounts set
    account_number = '90000001',
    server = 'Demo-Server',
    broker = 'Sample data, not a real account',
    currency = 'USD',
    leverage = 500,
    ea_version = '2026.10.17.5',
    last_sync_at = now(),
    balance = bal,
    equity = bal + float_all,
    credit = 0,
    margin = margin_now,
    free_margin = bal + float_all - margin_now,
    margin_level = round(((bal + float_all) / margin_now * 100)::numeric, 2),
    open_positions = 11,
    floating_pnl = float_all,
    -- A typical retail broker's levels: margin call at 100% margin level,
    -- stop-out at 50%.
    stop_out_mode = 'percent',
    margin_call_level = 100,
    stop_out_level = 50,
    tracking_since = t_start,
    peak_equity = greatest(pk, bal + float_all),
    max_drawdown_pct = round(mdd, 4),
    max_drawdown_at = mdd_at,
    last_sample_at = t_end
  where id = acc;
end
$demo$;
