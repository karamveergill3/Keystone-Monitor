"use client";

import { useMemo } from "react";
import { Line, ReferenceDot, ZIndexLayer, DefaultZIndexes, useXAxisScale, useYAxisScale } from "recharts";
import TimeChart, { Swatch, TipRow, TipRows } from "@/components/TimeChart";
import { drawdownBands, deepestFloating } from "@/lib/chartSeries";
import { money, pct, londonTime } from "@/lib/format";

// Balance and equity over the last 30 days, with the floating drawdown
// (equity below balance) shaded between them: the depth of the open
// baskets, which is what a grid account is watched for.
//
// samples come from equityPoints() on the server, already thinned to the
// deepest reading in each window; thinned says whether any were dropped.
// Their equity already has any broker credit taken off (point.credit says
// how much), so the floating here is the Floating drawdown tile's.

const DD_FILL_OPACITY = 0.18;

// Whole units for a deep drawdown, cents for a shallow one, so a worst
// moment of a few cents does not read -$0.
function floatingMoney(value, currency) {
  return money(value, currency, { decimals: Math.abs(value) < 10 ? 2 : 0 });
}

// The shading is drawn here rather than as a Recharts range Area: one Area
// has one curve type for both edges, and this gap is bounded by a step
// (balance) above and a straight line (equity) below. drawdownBands works
// out the exact polygons; this maps them through the chart's scales.
function DrawdownShade({ bands }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y || bands.length === 0) return null;
  let d = "";
  for (const band of bands) {
    band.forEach(([t, v], i) => {
      const px = x(t);
      const py = y(v);
      if (px === undefined || py === undefined) return;
      d += `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
    });
    d += "Z";
  }
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.area}>
      <path d={d} fill="var(--color-down)" fillOpacity={DD_FILL_OPACITY} stroke="none" />
    </ZIndexLayer>
  );
}

function EquityTip({ point, currency }) {
  // To the cent, as it prints: float dust from the subtraction must not
  // read -$0.00 or draw the drawdown swatch.
  const floating = Number((point.equity - point.balance).toFixed(2));
  const share = point.balance > 0 ? floating / point.balance : null;
  const credit = Number(point.credit) || 0;
  return (
    <>
      <p className="mb-1.5 text-muted">{londonTime(point.t)}</p>
      <TipRows>
        <TipRow swatch={<Swatch className="bg-series-1" />} label="Balance">
          {money(point.balance, currency)}
        </TipRow>
        <TipRow swatch={<Swatch className="bg-series-2" />} label={credit !== 0 ? "Equity less credit" : "Equity"}>
          {money(point.equity, currency)}
        </TipRow>
        {credit !== 0 && <TipRow label="Broker credit">{money(credit, currency)}</TipRow>}
        <TipRow swatch={floating < 0 ? <Swatch kind="area" className="bg-down/20" /> : null} label="Floating">
          {money(floating, currency, { sign: true })}
          {share !== null && <span className="ml-1 font-normal text-muted">{pct(share, { sign: true })}</span>}
        </TipRow>
      </TipRows>
    </>
  );
}

const ACTIVE_DOT = { r: 4, stroke: "var(--color-panel)", strokeWidth: 2 };

export default function EquityChart({
  samples,
  currency = "USD",
  empty = "Equity is sampled every 15 minutes once the EA is syncing.",
  thinned = false,
}) {
  const data = useMemo(() => samples ?? [], [samples]);
  const bands = useMemo(() => drawdownBands(data), [data]);
  const deepest = useMemo(() => deepestFloating(data), [data]);
  const anyCredit = data.some((p) => Number(p.credit) > 0 || Number(p.credit) < 0);

  const legend = [
    { label: "Balance", kind: "line", className: "bg-series-1" },
    { label: anyCredit ? "Equity less broker credit" : "Equity", kind: "line", className: "bg-series-2" },
    { label: "Floating drawdown", kind: "area", className: "bg-down/20" },
    // The worst moment, marked on the plot and named here, so it reads
    // without hovering.
    deepest && {
      key: "deepest",
      kind: "dot",
      className: "bg-down",
      label: (
        <span>
          Deepest <span className="num">{floatingMoney(deepest.floating, currency)}</span>
        </span>
      ),
    },
  ];

  const footer = thinned ? (
    <p className="mt-2 text-xs text-muted">
      Each point is the deepest of the 15-minute readings in its window, so no drawdown is smoothed away.
    </p>
  ) : null;

  return (
    <TimeChart
      data={data}
      values={data.flatMap((p) => [p.balance, p.equity])}
      currency={currency}
      legend={legend}
      tip={(point) => <EquityTip point={point} currency={currency} />}
      empty={empty}
      footer={footer}
    >
      <DrawdownShade bands={bands} />
      {/* Balance moves only when a deal closes: a step, held until the
          next reading. */}
      <Line
        dataKey="balance"
        name="Balance"
        type="stepAfter"
        stroke="var(--color-series-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        dot={false}
        activeDot={{ ...ACTIVE_DOT, fill: "var(--color-series-1)" }}
        isAnimationActive={false}
      />
      {/* Equity is a reading, joined straight: no smoothing that could
          round off a dip. */}
      <Line
        dataKey="equity"
        name="Equity"
        type="linear"
        stroke="var(--color-series-2)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        dot={false}
        activeDot={{ ...ACTIVE_DOT, fill: "var(--color-series-2)" }}
        isAnimationActive={false}
      />
      {deepest && (
        <ReferenceDot
          x={deepest.t}
          y={deepest.equity}
          r={4}
          fill="var(--color-down)"
          stroke="var(--color-panel)"
          strokeWidth={2}
        />
      )}
    </TimeChart>
  );
}
