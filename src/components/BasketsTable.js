import Pnl from "@/components/Pnl";
import WarnIcon from "@/components/WarnIcon";
import { ReasonIcon, distanceLevel, levelStyle } from "@/components/AttentionBanner";
import { distanceLabel } from "@/lib/attention";
import { BROKER_LEVELS_EA } from "@/lib/openPositions";
import { flagReason } from "@/lib/baskets";
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

// The banner over the table: how many are flagged and against what. When
// the week has banked something, a flagged basket would give all of it
// back and more; when it has banked nothing, any basket in loss is flagged,
// and the week's own figure is only context, never the threshold.
function flaggedBanner(view, currency) {
  const n = view.flagged.length;
  const them = n === 1 ? "it" : "them";
  if (view.banked > 0) {
    return [
      `${count(n, "basket", "baskets")} deeper than this week's ${money(view.banked, currency, { sign: true })} banked`,
      `: closing ${them} now would give back more than the week has realised.`,
    ];
  }
  return [
    `${count(n, "basket", "baskets")} in loss, and the week has banked nothing (${money(view.weekRealised, currency, { sign: true })})`,
    ": with nothing banked, every basket in loss counts.",
  ];
}

// The To stop-out cell: for the basket's symbol (its accountRisk entry in
// src/lib/risk.js), the move as a share of its price that would take equity
// to the broker's stop-out, and the price that is. The move is the
// symbol's, against its net position, which is not always this basket's
// side: a sell basket on a symbol that is net long gets there by a fall.
// Coloured on the same LIMITS as the attention reasons, with an icon.
function StopOutCell({ s, levels }) {
  if (s?.hedged) {
    return (
      <td className="px-4 py-2.5 text-right text-muted" title="Buys and sells on this symbol net to flat, so a move in it alone does not take equity to stop-out">
        hedged
      </td>
    );
  }
  const d = s?.stopOut;
  if (!d) {
    const why = !levels
      ? `The EA has not reported the broker's stop-out level yet (it does from ${BROKER_LEVELS_EA})`
      : "Unknown: no margin in use, or no point value for this symbol";
    return (
      <td className="px-4 py-2.5 text-right text-muted" title={why}>
        -
      </td>
    );
  }
  const level = d.move === 0 ? "red" : distanceLevel(d.pct);
  const tone = level ? levelStyle(level) : null;
  const direction = s.netLots > 0 ? "falls to" : "rises to";
  return (
    <td className={`px-4 py-2.5 text-right ${tone ? tone.cell : ""}`}>
      <span className="flex items-center justify-end gap-1.5">
        {tone && <ReasonIcon level={level} className="h-3.5 w-3.5" />}
        <span className={d.move === 0 ? "font-medium" : "num"}>{d.move === 0 ? "Reached" : distanceLabel(d.pct)}</span>
      </span>
      {d.move > 0 && (
        <span className={`block text-xs whitespace-nowrap ${tone ? "" : "text-muted"}`}>
          {d.price === null ? (
            "no price gets there"
          ) : (
            <>
              {direction} <span className="num">{number(d.price, s.decimals)}</span>
            </>
          )}
        </span>
      )}
    </td>
  );
}

// Each open basket (one symbol, one direction) on the account, deepest
// first, from accountBaskets in src/lib/baskets.js. A basket whose floating
// loss is more than the week has banked is marked by an icon and words as
// well as its colour. Every figure is as of the last sync, which the
// summary line says, since an account that stops syncing keeps its last
// list.
//
// risk, when given, is the account's accountRisk result (src/lib/risk.js)
// and adds how far each basket's symbol is from stop-out.
export default function BasketsTable({ view, currency, risk }) {
  if (!view || !["current", "none"].includes(view.state)) {
    return <p className={EMPTY}>{emptyText(view ?? { state: "waiting" })}</p>;
  }

  const { baskets, flagged, deepest, weekRealised } = view;
  const reason = flagReason(view, currency);
  const bySymbol = new Map((risk?.symbols ?? []).map((s) => [s.symbol, s]));
  const [bannerHead, bannerTail] = flaggedBanner(view, currency);

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
        {view.archived && " · archived, so nothing is flagged"}
      </p>

      {flagged.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-down/40 bg-down-soft px-3 py-2 text-sm text-down">
          <WarnIcon className="mt-1 h-4 w-4" />
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
          <table className={`w-full text-sm ${risk ? "min-w-[1140px]" : "min-w-[1040px]"}`}>
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
                {risk && (
                  <th
                    className="px-4 py-2.5 text-right font-medium whitespace-nowrap"
                    title="The move in this symbol, alone, that would take equity to the broker's stop-out, as a share of its price, and the price that would be. Everything else is taken to stay where it is."
                  >
                    To stop-out
                  </th>
                )}
                <th className="px-4 py-2.5 text-right font-medium" title="The lowest floating seen at any sync, its share of the balance then, and when">
                  Worst so far
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {baskets.map((b) => (
                <tr key={b.key} className={`border-b border-line/70 last:border-0 ${b.flagged ? "bg-down-soft" : ""}`}>
                  {/* The edge marker sits on the cell: a row's own box-shadow
                      does not paint in a collapsed table. */}
                  <td
                    className={`px-4 py-2.5 ${b.flagged ? "shadow-[inset_3px_0_0_var(--color-down)]" : ""}`}
                    title={b.magics.length ? `Magic ${b.magics.join(", ")}` : undefined}
                  >
                    <span className="font-medium text-ink">{b.symbol}</span>{" "}
                    <span className={sideClass(b.side)}>{b.side}</span>
                    {b.flagged && (
                      <span className="mt-0.5 flex items-start gap-1 text-xs font-medium text-down">
                        <WarnIcon className="mt-0.5 h-3.5 w-3.5" />
                        {reason}
                      </span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{number(b.positions, 0)}</td>
                  <td className="num px-4 py-2.5 text-right">{number(b.lots, 2)}</td>
                  <td className="num px-4 py-2.5 text-right">{b.avgPrice === null ? "-" : number(b.avgPrice, b.decimals)}</td>
                  <td className="num px-4 py-2.5 text-right">{b.currentPrice === null ? "-" : number(b.currentPrice, b.decimals)}</td>
                  <td className="px-4 py-2.5 text-right"><Pnl value={b.floating} currency={currency} /></td>
                  <td className={`num px-4 py-2.5 text-right ${b.drawdown > 0 ? "" : "text-muted"}`}>{pct(b.drawdownPct)}</td>
                  {risk && <StopOutCell s={bySymbol.get(b.symbol)} levels={risk.levels} />}
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
        A basket is every open position on one symbol in one direction. Worst readings are taken at each sync, about
        every 2 minutes, since tracking began.
        {risk &&
          " To stop-out is for the basket's symbol as a whole, all its buys and sells, moving alone; Margin and stop-out has the detail."}
      </p>
    </div>
  );
}
