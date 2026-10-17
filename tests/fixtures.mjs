// A sync payload as the EA sends it: a deposit, then one closed XAUUSD trade.
export function payload(overrides = {}) {
  return {
    v: 1,
    ea: "2026.10.17",
    account: {
      login: "51234567",
      server: "Broker-Live",
      company: "Broker Ltd",
      currency: "usd",
      leverage: 500,
      balance: 10_000,
      equity: 9_950.5,
      credit: 0,
      margin: 100,
      free_margin: 9_850.5,
      margin_level: 9_950.5,
      positions: 2,
      floating: -49.5,
    },
    deals: [
      {
        ticket: "1001", position: "0", time: "2026-10-01T08:00:00Z", type: "DEAL_TYPE_BALANCE",
        entry: "DEAL_ENTRY_IN", symbol: "", volume: 0, price: 0, profit: 10_000, swap: 0, commission: 0, fee: 0,
        magic: 0, comment: "Deposit",
      },
      {
        ticket: "1002", position: "1002", time: "2026-10-02T09:00:00Z", type: "DEAL_TYPE_BUY",
        entry: "DEAL_ENTRY_IN", symbol: "XAUUSD", volume: 0.1, price: 2650.1, profit: 0, swap: 0, commission: -0.35,
        fee: 0, magic: 100, comment: "",
      },
      {
        ticket: "1003", position: "1002", time: "2026-10-02T10:00:00Z", type: "DEAL_TYPE_SELL",
        entry: "DEAL_ENTRY_OUT", symbol: "XAUUSD", volume: 0.1, price: 2655.1, profit: 50, swap: -0.1,
        commission: -0.35, fee: 0, magic: 100, comment: "tp",
      },
    ],
    more: false,
    ...overrides,
  };
}
