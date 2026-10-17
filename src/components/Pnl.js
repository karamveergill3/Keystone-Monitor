import { money, pct } from "@/lib/format";

// A P&L figure coloured by its sign, with an optional gain beneath.
export default function Pnl({ value, currency, gain, decimals = 2 }) {
  const tone = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted";
  return (
    <span className={`num ${tone}`}>
      {money(value, currency, { sign: true, decimals })}
      {gain !== undefined && gain !== null && (
        <span className="block text-[11px] opacity-80">{pct(gain, { sign: true })}</span>
      )}
    </span>
  );
}
