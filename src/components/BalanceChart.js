"use client";

import { Line } from "recharts";
import TimeChart, { Swatch, TipRow, TipRows } from "@/components/TimeChart";
import { money, dayLabel, londonTime } from "@/lib/format";

// The balance at the end of every day with a deal, from balancePoints().
// A deposit or withdrawal moves the balance without being trading, so each
// day with one is marked, rather than leaving a cliff to explain itself.

// Money that came in or went out that day. Points without the split fall
// back to the net.
function flows(point) {
  const cash = Number(point.cashFlow) || 0;
  return {
    deposit: point.deposits ?? Math.max(0, cash),
    withdrawal: point.withdrawals ?? Math.min(0, cash),
  };
}

// A warn-coloured marker with a ring in the panel colour, so it stays clear
// where it sits on the line.
function FlowDot({ cx, cy, payload }) {
  if (!payload?.cashFlow || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={4} fill="var(--color-warn)" stroke="var(--color-panel)" strokeWidth={2} />;
}

function BalanceTip({ point, currency }) {
  const { deposit, withdrawal } = flows(point);
  const flowSwatch = <Swatch kind="dot" className="bg-warn" />;
  return (
    <>
      <p className="mb-1.5 text-muted">{point.day ? dayLabel(point.day) : londonTime(point.t)}</p>
      <TipRows>
        <TipRow swatch={<Swatch className="bg-series-1" />} label="Balance">
          {money(point.balance, currency)}
        </TipRow>
        {Number.isFinite(point.tradePnl) && (
          <TipRow label="Trading P&L">{money(point.tradePnl, currency, { sign: true })}</TipRow>
        )}
        {deposit > 0 && (
          <TipRow swatch={flowSwatch} label="Deposit">
            {money(deposit, currency, { sign: true })}
          </TipRow>
        )}
        {withdrawal < 0 && (
          <TipRow swatch={flowSwatch} label="Withdrawal">
            {money(withdrawal, currency, { sign: true })}
          </TipRow>
        )}
      </TipRows>
    </>
  );
}

export default function BalanceChart({ points, currency = "USD", empty = "No deals synced yet." }) {
  const data = points ?? [];
  const anyFlow = data.some((p) => Number(p.cashFlow) !== 0 && Number.isFinite(Number(p.cashFlow)));
  const legend = [
    { label: "Balance", kind: "line", className: "bg-series-1" },
    anyFlow && { label: "Deposit / withdrawal", kind: "dot", className: "bg-warn" },
  ];

  return (
    <TimeChart
      data={data}
      values={data.map((p) => p.balance)}
      currency={currency}
      legend={legend}
      tip={(point) => <BalanceTip point={point} currency={currency} />}
      empty={empty}
    >
      {/* A step: the balance a day closed on holds until the next day with
          a deal. */}
      <Line
        dataKey="balance"
        name="Balance"
        type="stepAfter"
        stroke="var(--color-series-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        dot={FlowDot}
        activeDot={{ r: 4, fill: "var(--color-series-1)", stroke: "var(--color-panel)", strokeWidth: 2 }}
        isAnimationActive={false}
      />
    </TimeChart>
  );
}
