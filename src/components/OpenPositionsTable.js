import Pnl from "@/components/Pnl";
import { ago, londonTime, money, number } from "@/lib/format";
import { openSnapshot } from "@/lib/openPositions";

const EMPTY = "rounded-lg border border-line bg-panel p-6 text-sm text-muted";

// A stop or target of 0 is MT5 for "none set".
function level(value) {
  return value === null || value === undefined || Number(value) === 0 ? "-" : number(value, 5);
}

// MT5 reports margin level as a percentage already (4000 is 4,000%), and
// as 0 when nothing is open.
function marginLevel(account) {
  if (!Number(account.margin) || account.margin_level === null || account.margin_level === undefined) return "-";
  return `${number(account.margin_level, 0)}%`;
}

function positions(n) {
  return `${number(n, 0)} ${n === 1 ? "position" : "positions"}`;
}

// Why there is no list to show (see openSnapshot in src/lib/openPositions.js).
function emptyText(state, reported, account) {
  if (state === "unreported") {
    const version = account.ea_version ? ` (${account.ea_version})` : "";
    return `The terminal has ${positions(reported)} open, but its EA${version} is older and does not list positions. Install the latest EA from the admin screen to see them here.`;
  }
  if (state === "pending") {
    return `The terminal counted ${positions(reported)} open at its last sync but sent an empty list. The next sync lists ${reported === 1 ? "it" : "them"}.`;
  }
  return "No open positions.";
}

// What the terminal had open at its last sync, newest first, under the
// account's margin figures from the same sync. Rows an earlier sync left
// behind are never listed as current.
export default function OpenPositionsTable({ rows, account, currency }) {
  const { state, rows: list, reported } = openSnapshot(rows, account);
  if (state === "waiting") {
    return <p className={EMPTY}>Open positions appear here once the EA is syncing.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Margin {money(account.margin, currency)} · free margin {money(account.free_margin, currency)} · margin level{" "}
        {marginLevel(account)} · as of last sync {ago(account.last_sync_at)}
      </p>
      {state !== "current" ? (
        <p className={EMPTY}>{emptyText(state, reported, account)}</p>
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-panel-2/70 text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-medium">Opened</th>
                  <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
                  <th className="px-4 py-2.5 text-left font-medium">Side</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lots</th>
                  <th className="px-4 py-2.5 text-right font-medium">Open</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current</th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Stop loss">SL</th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Take profit">TP</th>
                  <th className="px-4 py-2.5 text-right font-medium">Swap</th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Floating profit; swap is its own column">Profit</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr
                    key={p.ticket}
                    className="border-b border-line/70 last:border-0"
                    title={`Ticket ${p.ticket}${p.magic ? ` · magic ${p.magic}` : ""}${p.comment ? ` · ${p.comment}` : ""}`}
                  >
                    <td className="px-4 py-2.5 text-xs">{londonTime(p.open_time)}</td>
                    <td className="px-4 py-2.5">{p.symbol ?? "-"}</td>
                    <td className={`px-4 py-2.5 ${p.side === "buy" ? "text-up" : p.side === "sell" ? "text-down" : "text-muted"}`}>
                      {p.side ?? "-"}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{number(p.volume, 2)}</td>
                    <td className="num px-4 py-2.5 text-right">{p.open_price === null ? "-" : number(p.open_price, 5)}</td>
                    <td className="num px-4 py-2.5 text-right">{p.current_price === null ? "-" : number(p.current_price, 5)}</td>
                    <td className="num px-4 py-2.5 text-right text-muted">{level(p.sl)}</td>
                    <td className="num px-4 py-2.5 text-right text-muted">{level(p.tp)}</td>
                    <td className="num px-4 py-2.5 text-right">{money(p.swap, currency)}</td>
                    <td className="px-4 py-2.5 text-right"><Pnl value={Number(p.profit)} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            {reported > list.length
              ? `Showing ${number(list.length, 0)} of the ${number(reported, 0)} open on the terminal.`
              : `${positions(list.length)} open.`}
          </p>
        </>
      )}
    </div>
  );
}
