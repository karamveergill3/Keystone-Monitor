// Display formatting, shared by the pages and the PDFs.

const moneyFormats = new Map();

function moneyFormat(currency, decimals) {
  const key = `${currency}:${decimals}`;
  if (!moneyFormats.has(key)) {
    let f;
    try {
      f = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: currency || "USD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      // An unknown currency code from a broker: show the code, not a symbol.
      const plain = new Intl.NumberFormat("en-GB", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      f = { format: (v) => `${currency} ${plain.format(v)}` };
    }
    moneyFormats.set(key, f);
  }
  return moneyFormats.get(key);
}

export function money(value, currency = "USD", { decimals = 2, sign = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  const v = Number(value);
  const s = moneyFormat(currency, decimals).format(Math.abs(v));
  if (v < 0) return `-${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

export function pct(value, { decimals = 2, sign = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  const v = Number(value) * 100;
  const s = `${Math.abs(v).toFixed(decimals)}%`;
  if (v < 0 && s !== `${(0).toFixed(decimals)}%`) return `-${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

export function number(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const dayLabelFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// "2026-10-17" -> "17 Oct 2026". Keys are London days already, so they are
// formatted as plain dates, not converted again.
export function dayLabel(key) {
  if (!key) return "-";
  const [y, m, d] = key.split("-").map(Number);
  return dayLabelFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

const monthLabelFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function monthLabel(key) {
  if (!key) return "-";
  const [y, m] = key.split("-").map(Number);
  return monthLabelFormat.format(new Date(Date.UTC(y, m - 1, 1)));
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

export function londonTime(iso) {
  if (!iso) return "-";
  return timeFormat.format(new Date(iso));
}

// "3 min ago", for the last-sync column.
export function ago(iso, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}
