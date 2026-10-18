import Pnl from "@/components/Pnl";
import { LEVELS, ReasonIcon } from "@/components/AttentionBanner";
import { closeReason } from "@/lib/baskets";
import { ago, londonTime, money, number, pct } from "@/lib/format";

const EMPTY = "rounded-lg border border-line bg-panel p-6 text-sm text-muted";

function count(n, one, many) {
  return `${number(n, 0)} ${n === 1 ? one : many}`;
}

function sideClass(side) {
  return side === "buy" ? "text-up" : side === "sell" ? "text-down" : "text-muted";
}

// Why there is nothing to group (see openSnapshot in src/lib/openPositions.js).
// The open positions section below says what to do about it, so this only
// points there.
function emptyText(view) {
  if (view.state === "waiting") return "Baskets appear once the EA is syncing.";
  if (view.state === "unreported" || view.state === "pending") {
    return `The terminal has ${count(view.reported, "position", "positions")} open but its last sync sent no list of them, so there are no baskets to show. Open positions below says why.`;
  }
  return "No open baskets.";
}

function worstTitle(b) {
  if (!b.trackedSince) return "Not tracked yet, so this is the reading now. Tracking starts with the next sync.";
  return `The lowest floating seen at any sync since ${londonTime(b.trackedSince)}`;
}

// The banner over the table: how many baskets could be closed now with the
// week still in profit, and the week's figure they are measured against.
// Each is judged on its own, so the words never suggest closing them all
// at once would keep the week up.
function closableBanner(n, weekRealised, currency) {
  const week = money(weekRealised, currency, { sign: true });
  return [
    n === 1
      ? "1 basket can be closed and the week stays in profit"
      : `${count(n, "basket", "baskets")} can each be closed on its own with the week still in profit`,
    n === 1
      ? `: its floating loss is less than this week's ${week} realised profit.`
      : `: each one's floating loss, taken on its own, is less than this week's ${week} realised profit.`,
  ];
}

// Each open basket (one symbol, one direction) on the account, deepest
// first, from accountBaskets in src/lib/baskets.js. A basket in loss that
// could be closed now with the week's realised profit still above zero is
// tinted green and says so in words beside a tick, with what the week
// would keep; every other basket is plain. Every figure is as of the last
// sync, which the summary line says, since an account that stops syncing
// keeps its last list.
export default function BasketsTable({ view, currency }) {
  if (!view || !["current", "none"].includes(view.state)) {
    return <p className={EMPTY}>{emptyText(view ?? { state: "waiting" })}</p>;
  }

  const { baskets, deepest, weekRealised } = view;
  const closable = Array.isArray(view.closable) ? view.closable : [];
  const green = LEVELS.green;
  const [bannerHead, bannerTail] = closableBanner(closable.length, weekRealised, currency);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {"This week's realised profit "}
        <Pnl value={weekRealised} currency={currency} />
        {deepest && (
          <>
            {` · ${count(view.open, "open basket", "open baskets")} · deepest `}
            <Pnl value={deepest.floating} currency={currency} />
          </>
        )}
        {view.lastSyncAt && (
          <span title={londonTime(view.lastSyncAt)}>{` · as of last sync ${ago(view.lastSyncAt)}`}</span>
        )}
        {view.archived && " · archived, so nothing is marked"}
      </p>

      {closable.length > 0 && (
        <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${green.box} ${green.text}`}>
          <span className="mt-1 inline-flex">
            <ReasonIcon level="green" />
          </span>
          <span>
            <span className="font-semibold">{bannerHead}</span>
            {bannerTail}
          </span>
        </p>
      )}

      {!baskets.length ? (
        <p className={EMPTY}>No open baskets.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-panel-2/70 text-xs tracking-wider text-muted uppercase">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left font-medium">Basket</th>
                <th className="px-4 py-2.5 text-right font-medium">Positions</th>
                <th className="px-4 py-2.5 text-right font-medium">Lots</th>
                <th className="px-4 py-2.5 text-right font-medium" title="Volume-weighted open price: the break-even before swap">
                  Avg price
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Current</th>
                <th className="px-4 py-2.5 text-right font-medium" title="Profit plus swap of every position in the basket">Floating</th>
                <th className="px-4 py-2.5 text-right font-medium" title="Floating loss as a share of the balance">Drawdown</th>
                <th className="px-4 py-2.5 text-right font-medium" title="The lowest floating seen at any sync, its share of the balance then, and when">
                  Worst so far
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {baskets.map((b) => (
                <tr key={b.key} className={`border-b border-line/70 last:border-0 ${b.closable ? "bg-up-soft" : ""}`}>
                  {/* The edge marker sits on the cell: a row's own box-shadow
                      does not paint in a collapsed table. */}
                  <td
                    className={`px-4 py-2.5 ${b.closable ? green.edge : ""}`}
                    title={b.magics.length ? `Magic ${b.magics.join(", ")}` : undefined}
                  >
                    <span className="font-medium text-ink">{b.symbol}</span>{" "}
                    <span className={sideClass(b.side)}>{b.side}</span>
                    {b.closable && (
                      <span className={`mt-0.5 flex items-start gap-1 text-xs font-medium ${green.text}`}>
                        <span className="mt-0.5 inline-flex">
                          <ReasonIcon level="green" className="h-3.5 w-3.5" />
                        </span>
                        {closeReason(b, currency)}
                      </span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{number(b.positions, 0)}</td>
                  <td className="num px-4 py-2.5 text-right">{number(b.lots, 2)}</td>
                  <td className="num px-4 py-2.5 text-right">{b.avgPrice === null ? "-" : number(b.avgPrice, b.decimals)}</td>
                  <td className="num px-4 py-2.5 text-right">{b.currentPrice === null ? "-" : number(b.currentPrice, b.decimals)}</td>
                  <td className="px-4 py-2.5 text-right"><Pnl value={b.floating} currency={currency} /></td>
                  <td className={`num px-4 py-2.5 text-right ${b.drawdown > 0 ? "" : "text-muted"}`}>{pct(b.drawdownPct)}</td>
                  <td className="px-4 py-2.5 text-right" title={worstTitle(b)}>
                    <span className={`num block ${b.worstFloating < 0 ? "text-down" : "text-muted"}`}>
                      {money(b.worstFloating, currency, { sign: true })}
                    </span>
                    <span className="block text-xs whitespace-nowrap text-muted">
                      <span className="num">{pct(b.worstPct)}</span> · {b.worstAt ? londonTime(b.worstAt) : "now"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right" title={b.openedAt ? londonTime(b.openedAt) : undefined}>
                    <span className="block whitespace-nowrap">{b.openedAt ? ago(b.openedAt) : "-"}</span>
                    {b.positions > 1 && b.lastAddedAt && (
                      <span className="block text-xs whitespace-nowrap text-muted" title={`Newest position ${londonTime(b.lastAddedAt)}`}>
                        last added {ago(b.lastAddedAt)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        {view.reported > view.listed &&
          `Built from the ${number(view.listed, 0)} positions the EA listed, of ${number(view.reported, 0)} open on the terminal. `}
        A basket is every open position on one symbol in one direction. One in loss is marked with a tick when closing
        it now, on its own, would still leave this week&apos;s realised profit above zero. Worst readings are taken at
        each sync, about every 2 minutes, since tracking began.
      </p>
    </div>
  );
}
