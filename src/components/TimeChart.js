"use client";

import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { niceScale, timeAxis, axisMoney } from "@/lib/chartSeries";

// The frame both account charts draw in: a legend row, a London-time x
// axis, one money y axis on round figures, light horizontal grid lines and
// a tooltip panel. EquityChart and BalanceChart pass their series as
// children. Formatting happens here, on the client, because a server
// component cannot hand a function to a client one.

const TICK = { fill: "var(--color-muted)", fontSize: 12 };

// The y axis is as wide as its longest label. Oxanium's figures are about
// 0.6em, so 7.4px a character at 12px, plus the gap to the plot. Measuring
// the rendered text instead would draw the chart twice.
function axisWidth(labels) {
  const longest = Math.max(1, ...labels.map((l) => l.length));
  return Math.ceil(longest * 7.4) + 12;
}

// The mark a series is drawn with, in miniature, beside its name. Identity
// rides on this, never on coloured text.
export function Swatch({ kind = "line", className }) {
  const shape = {
    line: "h-0.5 w-4 rounded-full",
    area: "h-2.5 w-4 rounded-sm",
    dot: "size-2.5 rounded-full ring-2 ring-panel",
  }[kind];
  return <span aria-hidden="true" className={`inline-block shrink-0 ${shape} ${className}`} />;
}

// The grid a tooltip's rows sit in: swatch, name, value.
export function TipRows({ children }) {
  return <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">{children}</div>;
}

// One row of a tooltip. The value leads, in ink; the name is muted.
export function TipRow({ swatch = null, label, children }) {
  return (
    <>
      <span className="flex w-4 justify-center">{swatch}</span>
      <span className="text-muted">{label}</span>
      <span className="num text-right font-medium text-ink">{children}</span>
    </>
  );
}

// data: points with t (ms) and the children's dataKeys. values: every
// figure the y axis must show. legend: [{ label, kind, className }]. tip:
// (point) => the tooltip's header and rows.
export default function TimeChart({ data, values, currency = "USD", legend = [], tip, empty, footer = null, children }) {
  if (!data?.length) {
    return <div className="flex h-60 items-center justify-center text-sm text-muted sm:h-72">{empty}</div>;
  }

  const finite = values.filter(Number.isFinite);
  // Up to six ticks: with five, a range that starts on a round deposit
  // often needs a step twice as big and leaves half the plot empty.
  const y = niceScale(Math.min(...finite), Math.max(...finite), 6);
  const top = Math.max(Math.abs(y.min), Math.abs(y.max));
  const yLabel = (v) => axisMoney(v, currency, y.step, top);

  const x = timeAxis(data[0].t, data[data.length - 1].t);

  return (
    <div className="w-full">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {legend.filter(Boolean).map((item) => (
          <li key={item.key ?? item.label} className="inline-flex items-center gap-1.5">
            <Swatch kind={item.kind} className={item.className} />
            {item.label}
          </li>
        ))}
      </ul>
      <div className="h-60 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          {/* Right margin: room for the line's last active dot and the last
              x label. timeAxis drops ticks too near either end, and
              preserveStartEnd keeps any that remain inside the frame. */}
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis
              dataKey="t"
              type="number"
              domain={x.domain}
              ticks={x.ticks}
              tickFormatter={x.label}
              interval="preserveStartEnd"
              minTickGap={12}
              tick={TICK}
              tickLine={false}
              tickSize={0}
              tickMargin={10}
              axisLine={{ stroke: "var(--color-line)" }}
              height={30}
            />
            <YAxis
              type="number"
              domain={[y.min, y.max]}
              ticks={y.ticks}
              interval={0}
              tickFormatter={yLabel}
              tick={TICK}
              tickLine={false}
              tickSize={0}
              tickMargin={8}
              axisLine={false}
              width={axisWidth(y.ticks.map(yLabel))}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const point = active ? payload?.[0]?.payload : null;
                if (!point) return null;
                return (
                  <div className="min-w-48 rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-md shadow-ink/10">
                    {tip(point)}
                  </div>
                );
              }}
            />
            {children}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {footer}
    </div>
  );
}
