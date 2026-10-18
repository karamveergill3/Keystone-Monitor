import { distanceLabel } from "@/lib/attention";
import { money, number } from "@/lib/format";
import { BROKER_LEVELS_EA } from "@/lib/openPositions";

const EMPTY = "rounded-lg border border-line bg-panel p-6 text-sm text-muted";

function sideClass(side) {
  return side === "buy" ? "text-up" : side === "sell" ? "text-down" : "text-muted";
}

// A broker level as typed into the terminal: 50, or 30.5, never 50.00.
function plain(v) {
  return number(v, Number.isInteger(Number(v)) ? 0 : 2);
}

// "margin call at 100%, stop-out at 50%", or, when the broker sets them as
// money, the equity each is reached at.
function levelsText(levels, currency) {
  const at = (v) => (levels.mode === "money" ? `equity ${money(v, currency)}` : `${plain(v)}%`);
  const parts = [];
  if (levels.marginCall !== null) parts.push(`margin call at ${at(levels.marginCall)}`);
  parts.push(`stop-out at ${at(levels.stopOut)}`);
  return parts.join(", ");
}

// A figure box like StatTile's. Always plain: nothing here is coloured or
// flagged, however close the account is to a level. The site's one
// highlight is a closable basket (src/lib/attention.js).
function Figure({ label, children, sub }) {
  return (
    <div className="hud rounded-md border border-line bg-panel px-4 py-3.5">
      <p className="text-xs font-medium tracking-wider text-muted uppercase">{label}</p>
      <div className="num mt-1 text-base font-semibold [overflow-wrap:anywhere] sm:text-xl">
        <span>{children}</span>
      </div>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

// How far equity is above a level, in words when it is not.
function bufferWords(buffer, currency, name) {
  if (buffer === null) return null;
  return buffer > 0 ? `${money(buffer, currency)} above ${name}` : `${money(-buffer, currency)} below ${name}`;
}

// The figures over the table: margin level against the broker's levels,
// how much equity stands between the account and stop-out, and the symbol
// closest to it. Without the levels, or with no margin in use, there is no
// distance to give, so one line carries the margin level alone.
function Summary({ risk, currency }) {
  const { levels, marginLevel, bufferToStopOut, bufferToMarginCall, nearest } = risk;
  const used = Number(risk.margin) > 0;
  if (!levels || !used) {
    return (
      <p className="text-xs text-muted">
        {used ? (
          <>
            Margin level <span className="num">{marginLevel === null ? "-" : `${number(marginLevel, 0)}%`}</span>
          </>
        ) : (
          "No margin in use, so the broker's levels do not apply"
        )}
        {levels && ` · the broker's levels: ${levelsText(levels, currency)}`}
      </p>
    );
  }

  const atMarginCall = bufferToMarginCall !== null && bufferToMarginCall <= 0;
  const atStopOut = bufferToStopOut !== null && bufferToStopOut <= 0;
  const nearestReached = nearest?.stopOut.move === 0;
  const equitySub = [
    bufferWords(bufferToMarginCall, currency, "margin call"),
    risk.stopOutEquity !== null && `stop-out at equity ${money(risk.stopOutEquity, currency)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const nearestSub = risk.state !== "current"
    ? "Needs the list of open positions, which the last sync did not send"
    : !nearest
    ? "No symbol has a distance: each is hedged or its point value is unknown"
    : nearestReached
      ? `${nearest.symbol} net ${nearest.side}: equity is already at or below stop-out`
      : `${nearest.symbol} net ${nearest.side}: ${
          nearest.stopOut.price === null
            ? "no price gets there"
            : `${nearest.netLots > 0 ? "a fall" : "a rise"} to ${number(nearest.stopOut.price, nearest.decimals)}`
        }`;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Figure label="Margin level" sub={levelsText(levels, currency)}>
        {marginLevel === null ? "-" : `${number(marginLevel, 0)}%`}
        {atStopOut ? " · at stop-out" : atMarginCall ? " · at margin call" : ""}
      </Figure>
      <Figure label={atStopOut ? "Equity below stop-out" : "Equity above stop-out"} sub={equitySub}>
        {bufferToStopOut === null ? "-" : money(Math.abs(bufferToStopOut), currency)}
      </Figure>
      <Figure label="Nearest to stop-out" sub={nearestSub}>
        {!nearest ? "-" : nearestReached ? "Reached" : distanceLabel(nearest.stopOut.pct)}
      </Figure>
    </div>
  );
}

// One distance: the price at the level, then the move from now (signed:
// a net buy gets there by falling) and the move as a share of the price.
// Reached when equity is already at or below the level, said in plain
// words: no distance is coloured, however short.
function DistanceCell({ d, s }) {
  if (!d) {
    return <td className="num px-4 py-2.5 text-right text-muted">-</td>;
  }
  const sign = s.netLots > 0 ? "-" : "+";
  return (
    <td className="px-4 py-2.5 text-right">
      <span className="flex items-center justify-end gap-1.5">
        {d.move === 0 ? (
          <span className="font-medium">Reached</span>
        ) : d.price === null ? (
          <span className="text-muted" title="The move would take the price to zero or below: this symbol alone cannot get there">
            Out of reach
          </span>
        ) : (
          <span className="num">{number(d.price, s.decimals)}</span>
        )}
      </span>
      {d.move > 0 && (
        <span className="block text-xs whitespace-nowrap text-muted">
          <span className="num">{`${sign}${number(d.move, s.decimals)}`}</span> · <span className="num">{distanceLabel(d.pct)}</span>
        </span>
      )}
    </td>
  );
}

function ExposureCell({ s }) {
  if (s.hedged) {
    return (
      <td className="px-4 py-2.5 text-right" title="Buys and sells on this symbol net to flat">
        <span className="block text-muted">hedged</span>
        <span className="block text-xs whitespace-nowrap text-muted"><span className="num">{number(s.lots, 2)}</span> lots open</span>
      </td>
    );
  }
  return (
    <td className="px-4 py-2.5 text-right">
      <span className="block whitespace-nowrap">
        <span className="num">{number(Math.abs(s.netLots), 2)}</span> <span className={sideClass(s.side)}>{s.side}</span>
      </span>
      {s.lots !== Math.abs(s.netLots) && (
        <span className="block text-xs whitespace-nowrap text-muted">
          <span className="num">{number(s.lots, 2)}</span> lots open
        </span>
      )}
    </td>
  );
}

function ValueCell({ s, currency }) {
  if (s.hedged) return <td className="num px-4 py-2.5 text-right text-muted">-</td>;
  if (s.pointValue === null) {
    return (
      <td className="px-4 py-2.5 text-right text-muted" title="The terminal sent no point value for this symbol, and no position has moved enough to estimate one">
        unknown
      </td>
    );
  }
  return (
    <td className="px-4 py-2.5 text-right">
      <span className="num block">{money(s.exposure ?? Math.abs(s.netLots) * s.pointValue, currency)}</span>
      <span className="block text-xs whitespace-nowrap text-muted">
        <span className="num">{money(s.pointValue, currency)}</span> a lot
      </span>
    </td>
  );
}

// The body of the account page's Margin and stop-out section, from
// accountRisk in src/lib/risk.js: margin level against the broker's margin
// call and stop-out, the equity between the account and stop-out, and for
// each symbol it has open how far its price can move against the net
// position before each level is reached. For a grid bot that keeps adding
// into a move, this is the distance that matters: stop-out closes
// everything at the worst prices of it.
//
// Each distance is one symbol moving alone, with margin where it is, so the
// footnote says so; several symbols moving together get there sooner.
export default function RiskPanel({ risk, currency }) {
  if (!risk || risk.state === "waiting") {
    return <p className={EMPTY}>Margin and stop-out figures appear here once the EA is syncing.</p>;
  }

  const { state, levels, symbols } = risk;
  const levelsNote = !levels && (
    <p className="text-xs text-muted">
      {`The broker's margin call and stop-out levels are sent by the EA from ${BROKER_LEVELS_EA}. Install the latest EA from the admin screen to see how far each symbol is from them.`}
    </p>
  );

  if (state === "none" || (state === "current" && !symbols.length)) {
    return (
      <div className="space-y-2">
        <p className={EMPTY}>Nothing open, so nothing is at risk of stop-out.</p>
        {levels ? <p className="text-xs text-muted">{`The broker's levels: ${levelsText(levels, currency)}.`}</p> : levelsNote}
      </div>
    );
  }

  if (state !== "current") {
    return (
      <div className="space-y-2">
        <Summary risk={risk} currency={currency} />
        {levelsNote}
        <p className={EMPTY}>
          The distance to stop-out for each symbol needs the list of open positions, which the last sync did not send.
          The Open positions section says why.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Summary risk={risk} currency={currency} />
      {levelsNote}
      {risk.partial && (
        <p className="text-xs text-muted">
          {`Built from the ${number(risk.listed, 0)} positions the EA listed, of ${number(risk.reported, 0)} open on the terminal, so the real distances may be shorter.`}
        </p>
      )}
      <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-panel-2/70 text-xs tracking-wider text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-right font-medium" title="Buy lots less sell lots on this symbol, and which way that leaves the account">
                Exposure
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Price</th>
              <th className="px-4 py-2.5 text-right font-medium" title="What the net position gains or loses, in the account's currency, when this symbol's price moves by 1.0; below it, the same for one lot">
                Value of a 1.0 move
              </th>
              {levels && (
                <>
                  <th className="px-4 py-2.5 text-right font-medium" title="The price this symbol alone would have to reach to bring equity down to the broker's margin call, the move from now, and that move as a share of the price">
                    To margin call
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium" title="The price this symbol alone would have to reach to bring equity down to the broker's stop-out, the move from now, and that move as a share of the price">
                    To stop-out
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => (
              <tr key={s.symbol} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink">{s.symbol}</td>
                <ExposureCell s={s} />
                <td className="num px-4 py-2.5 text-right">{s.price === null ? "-" : number(s.price, s.decimals)}</td>
                <ValueCell s={s} currency={currency} />
                {levels && (
                  <>
                    {s.hedged ? (
                      <td colSpan={2} className="px-4 py-2.5 text-right text-xs text-muted">
                        Hedged: buys and sells net to flat, so no distance
                      </td>
                    ) : (
                      <>
                        <DistanceCell d={s.marginCall} s={s} />
                        <DistanceCell d={s.stopOut} s={s} />
                      </>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {levels &&
          "Each distance assumes only that symbol moves: every other position, and the margin in use, stay as they are. Several symbols moving together get there sooner. "}
        Point values are the terminal&apos;s own, or worked out from a position&apos;s profit when it sends none. As of
        the last sync.
      </p>
    </div>
  );
}
