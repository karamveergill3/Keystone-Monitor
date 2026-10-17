-- DEMO ACCOUNT: sample data so the site has something to show before a real
-- terminal is connected. Run it in the Supabase SQL editor; it is safe to
-- run again (it replaces itself). It adds "DEMO · Test account · 50k" to
-- V100: a $50,000 deposit, about four months of weekday trades, a $3,000
-- withdrawal, 30 days of equity samples and three open positions. Nothing
-- in it is a real account.
--
-- TO REMOVE IT (deals, samples and positions go with it):
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
begin
  select id into proj from public.projects where slug = 'v100';
  delete from public.accounts where id = acc;
  perform setseed(0.4242);

  insert into public.accounts (id, project_id, label) values (acc, proj, 'DEMO · Test account · 50k');

  insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
  values (acc, tk::text, null, date_trunc('day', now()) - interval '120 days' + interval '8 hours', 'balance', 'in', 'cash', null, 0, 0, 50000, 0, 0, 0, 50000, 0, 'Deposit');
  tk := tk + 1;

  for day in select g::date from generate_series(current_date - 119, current_date - 1, interval '1 day') g loop
    continue when extract(isodow from day) in (6, 7);
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
  end loop;

  insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, swap, commission, fee, net, magic, comment)
  values (acc, tk::text, null, date_trunc('day', now()) - interval '45 days' + interval '17 hours', 'balance', 'in', 'cash', null, 0, 0, -3000, 0, 0, 0, -3000, 0, 'Withdrawal');
  tk := tk + 1;

  insert into public.equity_samples (account_id, at, balance, equity)
  select acc, ts, b, b + round(((random() - 0.6) * 300)::numeric, 2)
  from (
    select ts, (select coalesce(sum(d.net), 0) from public.deals d where d.account_id = acc and d.time <= ts and d.kind <> 'credit') as b
    from generate_series(date_trunc('hour', now()) - interval '30 days', date_trunc('hour', now()), interval '2 hours') ts
  ) x;

  select coalesce(sum(net), 0) into bal from public.deals where account_id = acc and kind <> 'credit';

  insert into public.open_positions (account_id, ticket, symbol, side, volume, open_price, current_price, sl, tp, swap, profit, open_time, magic, comment, updated_at) values
    (acc, '7999001', 'XAUUSD', 'buy', 0.50, 2651.40, 2658.90, 2640.00, 2675.00, -1.20, 375.00, now() - interval '5 hours', 2026, '', now()),
    (acc, '7999002', 'EURUSD', 'sell', 1.00, 1.08420, 1.08510, 1.08900, 1.07800, 0, -90.00, now() - interval '2 hours', 2026, '', now()),
    (acc, '7999003', 'NAS100', 'buy', 0.30, 20110.50, 20096.20, 0, 20300.00, 0, -42.90, now() - interval '40 minutes', 2026, '', now());

  update public.accounts set
    account_number = '90000001',
    server = 'Demo-Server',
    broker = 'Sample data, not a real account',
    currency = 'USD',
    leverage = 500,
    ea_version = '2026.10.17.3',
    last_sync_at = now(),
    balance = bal,
    equity = bal + 242.10,
    credit = 0,
    margin = 1850,
    free_margin = bal + 242.10 - 1850,
    margin_level = round(((bal + 242.10) / 1850 * 100)::numeric, 2),
    open_positions = 3,
    floating_pnl = 242.10,
    tracking_since = now() - interval '30 days',
    peak_equity = round(bal * 1.03, 2),
    max_drawdown_pct = 0.0485,
    max_drawdown_at = now() - interval '12 days',
    last_sample_at = now()
  where id = acc;
end
$demo$;
