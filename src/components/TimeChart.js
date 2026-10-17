"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { money } from "@/lib/format";

// One or two lines over time. Points are { t: ms, a, b? }. Formatting
// happens here because a server component cannot hand a function to a
// client one.
export default function TimeChart({ points, currency = "USD", aLabel, bLabel, empty = "Nothing to chart yet." }) {
  if (!points?.length) {
    return <div className="flex h-56 items-center justify-center text-sm text-muted">{empty}</div>;
  }
  // The shared formatter, which falls back to the code itself for a
  // currency Intl does not know (a broker reporting USDT, say) instead of
  // throwing and taking the whole page down.
  const amount = (v) => money(v, currency, { decimals: 0 });
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  const full = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

  return (
    <div className="w-full">
      {bLabel && (
        <p className="mb-2 flex gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-series-1" />{aLabel}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-series-2" />{bLabel}</span>
        </p>
      )}
      <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.8} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => date.format(t)}
            stroke="var(--color-line)"
            tick={{ fill: "var(--color-muted)" }}
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            tickFormatter={amount}
            stroke="var(--color-line)"
            tick={{ fill: "var(--color-muted)" }}
            axisLine={false}
            fontSize={12}
            width={80}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: "var(--color-panel-2)", border: "1px solid var(--color-line-strong)", borderRadius: 6, fontSize: 13, color: "var(--color-ink)", fontFamily: "var(--font-mono)" }}
            labelStyle={{ color: "var(--color-muted)", marginBottom: 2 }}
            itemStyle={{ color: "var(--color-ink)" }}
            cursor={{ stroke: "var(--color-line)" }}
            labelFormatter={(t) => full.format(t)}
            formatter={(v, name) => [amount(v), name === "a" ? aLabel : bLabel]}
          />
          {/* A wide, faint copy under each line is its neon glow. Not in the
              legend or the tooltip. */}
          <Line type="monotone" dataKey="a" stroke="var(--color-series-1)" strokeOpacity={0.18} strokeWidth={7} dot={false} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
          {bLabel && (
            <Line type="monotone" dataKey="b" stroke="var(--color-series-2)" strokeOpacity={0.18} strokeWidth={7} dot={false} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
          )}
          <Line type="monotone" dataKey="a" name="a" stroke="var(--color-series-1)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-panel)" }} strokeWidth={2} isAnimationActive={false} />
          {bLabel && (
            <Line type="monotone" dataKey="b" name="b" stroke="var(--color-series-2)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-panel)" }} strokeWidth={2} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
