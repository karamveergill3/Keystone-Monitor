// What a deal is, decided once at ingest and stored as deals.kind.
//
// The EA sends MetaTrader's own enum names (EnumToString), so nothing here
// depends on the enum's numeric values, which MetaQuotes does not promise.
//
//   trade  buy, sell, and their cancelled forms       trading P&L
//   other  swap, charges, commission, interest, tax   trading P&L
//   cash   balance operations and bonuses             deposits/withdrawals
//   credit broker credit                              neither: it never
//                                                     touches the balance

const TRADE = new Set(["buy", "sell", "buy_canceled", "sell_canceled"]);
const CASH = new Set(["balance", "bonus"]);
const CREDIT = new Set(["credit"]);

// "DEAL_TYPE_BUY" -> "buy". Already-short names pass through, so the
// server accepts either form.
export function normaliseType(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^deal_type_/, "");
  return /^[a-z_]{1,40}$/.test(s) ? s : null;
}

// "DEAL_ENTRY_OUT" -> "out".
export function normaliseEntry(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^deal_entry_/, "");
  return ["in", "out", "inout", "out_by", "state"].includes(s) ? s : null;
}

export function kindOf(type) {
  if (TRADE.has(type)) return "trade";
  if (CASH.has(type)) return "cash";
  if (CREDIT.has(type)) return "credit";
  return "other";
}

export function isClosing(entry) {
  return entry === "out" || entry === "inout" || entry === "out_by";
}
