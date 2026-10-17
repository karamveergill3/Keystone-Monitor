import Link from "next/link";
import { notFound } from "next/navigation";
import StatTile from "@/components/StatTile";
import StatusDot from "@/components/StatusDot";
import Pnl from "@/components/Pnl";
import EquityChart from "@/components/EquityChart";
import BalanceChart from "@/components/BalanceChart";
import PnlCalendar from "@/components/PnlCalendar";
import PeriodTable from "@/components/PeriodTable";
import PositionsTable from "@/components/PositionsTable";
import OpenPositionsTable from "@/components/OpenPositionsTable";
import BasketsTable from "@/components/BasketsTable";
import ClosedBasketsTable from "@/components/ClosedBasketsTable";
import ReportForm from "@/components/ReportForm";
import { db } from "@/lib/db";
import { getAccount, listProjects, dailyFor, positionsPage, equitySamples, openPositions, openBasketsFor, closedBaskets } from "@/lib/data";
import { accountRow } from "@/lib/accountView";
import { summarise, dailyReturns, groupPeriods } from "@/lib/accountStats";
import { accountBaskets } from "@/lib/baskets";
import { equityPoints, balancePoints } from "@/lib/chartSeries";
import { todayKey, monthStart, addMonths } from "@/lib/days";
import { money, pct, number, ago, londonTime, dayLabel } from "@/lib/format";
import { hrefWith, pageNumber } from "@/lib/query";

const PAGE_SIZE = 10;
const EQUITY_DAYS = 30;
const BASKETS_PAGE_SIZE = 5;
const VIEWS = ["calendar", "weeks", "months"];

export async function generateMetadata({ params }) {
  const { id } = await params;
  const supabase = await db();
  const account = await getAccount(supabase, id);
  return { title: account?.label ?? "Account" };
}

export default async function AccountPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await db();

  const account = await getAccount(supabase, id);
  if (!account) notFound();

  const today = todayKey();
  const view = VIEWS.includes(query.view) ? query.view : "calendar";
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "") && `${query.month}-01` <= today ? `${query.month}-01` : monthStart(today);
  const page = pageNumber(query.page);
  const basketPage = pageNumber(query.bpage);

  const [projects, dailyMap, positions, samples, open, trackedMap, closed] = await Promise.all([
    listProjects(supabase),
    dailyFor(supabase, [account.id]),
    positionsPage(supabase, account.id, { page, pageSize: PAGE_SIZE }),
    equitySamples(supabase, account.id, EQUITY_DAYS),
    openPositions(supabase, account.id),
    openBasketsFor(supabase, [account.id]),
    closedBaskets(supabase, account.id, { page: basketPage, pageSize: BASKETS_PAGE_SIZE }),
  ]);
  const project = projects.find((p) => p.id === account.project_id);
  const daily = dailyMap.get(account.id) ?? [];
  const row = accountRow(account, daily, today);
  const c = row.currency;
  const all = summarise(daily, row.balance);
  const returns = dailyReturns(daily, row.balance);
  const baskets = accountBaskets({ rows: open, account: row, weekRealised: row.periods.week.pnl, tracked: trackedMap.get(account.id) ?? [] });

  const path = `/accounts/${account.id}`;
  const balanceSeries = balancePoints(returns);
  const equity = equityPoints(samples);
  const nextMonth = addMonths(month, 1);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted">
            {project && <Link href={`/projects/${project.slug}`} className="hover:text-ink">{project.name}</Link>}
            {account.archived_at && <span className="ml-2 text-warn">Archived</span>}
          </p>
          <h1 className="text-xl font-semibold">{account.label}</h1>
          <p className="text-sm text-muted">
            {account.account_number
              ? `${account.account_number} · ${account.server}${account.broker ? ` · ${account.broker}` : ""}${account.leverage ? ` · 1:${account.leverage}` : ""}`
              : "Waiting for the EA's first sync"}
          </p>
        </div>
        <div className="text-xs text-muted sm:text-right">
          <p className="inline-flex items-center gap-2">
            <StatusDot status={row.status} /> Last sync {ago(account.last_sync_at)}
          </p>
          {account.ea_version && <p>EA {account.ea_version}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Balance" sub={Number(account.credit) > 0 ? `Plus ${money(account.credit, c)} broker credit, not counted` : null}>
          {money(row.balance, c)}
        </StatTile>
        <StatTile label="Equity" sub={`${number(account.open_positions ?? 0, 0)} open positions, floating ${money(account.floating_pnl, c, { sign: true })}`}>
          {money(row.equity, c)}
        </StatTile>
        <StatTile label="Floating drawdown" sub="Equity below balance right now">{pct(row.floatingDd)}</StatTile>
        <StatTile
          label="Max drawdown"
          sub={account.tracking_since ? `Equity, since ${dayLabel(account.tracking_since.slice(0, 10))}${account.max_drawdown_at ? `; worst ${londonTime(account.max_drawdown_at)}` : ""}` : "Starts at the first sync"}
        >
          {pct(row.maxDd)}
        </StatTile>
        <StatTile label="Gain, all time" sub="Time-weighted, like Myfxbook's Gain">
          <span className={all.gain >= 0 ? "text-up" : "text-down"}>{pct(all.gain, { sign: true })}</span>
        </StatTile>
        <StatTile label="Trading P&L, all time" sub={`Deposits ${money(all.deposits, c)} · withdrawals ${money(all.withdrawals, c)}`}>
          <Pnl value={all.tradePnl} currency={c} />
        </StatTile>
        <StatTile label="This month" sub={`Today ${money(row.periods.today.pnl, c, { sign: true })} · week ${money(row.periods.week.pnl, c, { sign: true })}`}>
          <Pnl value={row.periods.month.pnl} currency={c} gain={row.periods.month.gain} />
        </StatTile>
        <StatTile
          label="Trade record"
          sub={`${pct(all.winRate, { decimals: 1 })} won · profit factor ${all.profitFactor === null ? "-" : number(all.profitFactor, 2)} · ${pct(all.maxDrawdown)} worst day-end drawdown`}
        >
          {all.closed.toLocaleString("en-GB")} closed
        </StatTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="hud rounded-md border border-line bg-panel p-4">
          <h2 className="mb-3 text-xs font-medium tracking-wider text-muted uppercase">Balance, every day with a deal</h2>
          <BalanceChart points={balanceSeries} currency={c} empty="No deals synced yet." />
        </section>
        <section className="hud rounded-md border border-line bg-panel p-4">
          <h2 className="mb-3 text-xs font-medium tracking-wider text-muted uppercase">Balance and equity, last {EQUITY_DAYS} days</h2>
          <EquityChart samples={equity.points} thinned={equity.thinned} currency={c} empty="Equity is sampled every 15 minutes once the EA is syncing." />
        </section>
      </div>

      <section id="baskets" className="space-y-3">
        <h2 className="text-base font-semibold">Open baskets</h2>
        <BasketsTable view={baskets} currency={c} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Open positions</h2>
        <OpenPositionsTable rows={open} account={account} currency={c} />
      </section>

      <section id="closed-baskets" className="space-y-3">
        <ClosedBasketsTable
          title="Closed baskets"
          rows={closed.rows}
          total={closed.total}
          page={basketPage}
          pageSize={BASKETS_PAGE_SIZE}
          currency={c}
          eaVersion={account.ea_version}
          hrefForPage={(p) => hrefWith(path, query, { bpage: p === 1 ? null : p })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Profit and loss</h2>
          <div className="flex gap-1 rounded-lg bg-panel-2 p-1 text-sm">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={hrefWith(path, query, { view: v === "calendar" ? null : v, page: null })}
                className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-accent-soft font-medium text-accent ring-1 ring-accent/40" : "text-muted hover:text-ink"}`}
              >
                {v === "calendar" ? "Days" : v}
              </Link>
            ))}
          </div>
        </div>
        {view === "calendar" && (
          <PnlCalendar
            returns={returns}
            month={month}
            currency={c}
            prevHref={hrefWith(path, query, { month: addMonths(month, -1).slice(0, 7) })}
            nextHref={nextMonth <= today ? hrefWith(path, query, { month: nextMonth.slice(0, 7) }) : null}
          />
        )}
        {view === "weeks" && <PeriodTable periods={groupPeriods(daily, row.balance, "week")} unit="week" currency={c} />}
        {view === "months" && <PeriodTable periods={groupPeriods(daily, row.balance, "month")} unit="month" currency={c} />}
      </section>

      <section id="history" className="scroll-mt-24 space-y-3">
        <PositionsTable
          title="Trade history"
          rows={positions.rows}
          total={positions.total}
          page={page}
          pageSize={PAGE_SIZE}
          currency={c}
          hrefForPage={(p) => hrefWith(path, query, { page: p === 1 ? null : p })}
        />
      </section>

      <ReportForm action={`/api/reports/account/${account.id}`} title="PDF report for this account" />
    </div>
  );
}
