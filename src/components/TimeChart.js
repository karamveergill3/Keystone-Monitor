"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// One or two lines over time. Points are { t: ms, a, b? }. Formatting
// happens here because a server component cannot hand a function to a
// client one.
export default function TimeChart({ points, currency = "USD", aLabel, bLabel, empty = "Nothing to chart yet." }) {
  if (!points?.length) {
    return <div className="flex h-56 items-center justify-center text-sm text-muted">{empty}</div>;
  }
  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  const full = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => date.format(t)}
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => money.format(v)}
            stroke="var(--color-muted)"
            fontSize={11}
            width={80}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: "var(--color-panel-2)", border: "1px solid var(--color-line)", fontSize: 12 }}
            labelFormatter={(t) => full.format(t)}
            formatter={(v, name) => [money.format(v), name === "a" ? aLabel : bLabel]}
          />
          <Line type="monotone" dataKey="a" name="a" stroke="var(--color-accent)" dot={false} strokeWidth={2} isAnimationActive={false} />
          {bLabel && (
            <Line type="monotone" dataKey="b" name="b" stroke="var(--color-up)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
