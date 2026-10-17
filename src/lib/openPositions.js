// What the account page can say about a terminal's open positions, from the
// rows in open_positions and the account row.
//
// Every row of a snapshot carries the time of the sync that sent it, the
// same instant as the account's last_sync_at (src/lib/syncIngest.js). A
// sync from an EA too old to list positions leaves the rows alone, so rows
// older than last_sync_at are an earlier sync's list: the positions in it
// may have closed since, and they are never shown as current.

// The first EA build that lists its open positions.
export const OPEN_POSITIONS_EA = "2026.10.17.2";

// The first that also sends the broker's margin call and stop-out levels
// and each position's point value, which the distance to stop-out needs.
export const BROKER_LEVELS_EA = "2026.10.17.5";

// "2026.10.17.2" as [2026, 10, 17, 2]; null for anything else.
function versionParts(version) {
  const s = String(version ?? "").trim();
  if (!/^\d+(\.\d+)*$/.test(s)) return null;
  return s.split(".").map(Number);
}

// Whether an EA version lists open positions. Versions are dates with an
// optional build number, compared part by part, a missing part being 0.
// An unreadable version is taken as an older EA.
export function eaReportsOpen(version) {
  const v = versionParts(version);
  if (!v) return false;
  const min = versionParts(OPEN_POSITIONS_EA);
  for (let i = 0; i < Math.max(v.length, min.length); i++) {
    const a = v[i] ?? 0;
    const b = min[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

// One of:
//   waiting     the EA has never synced
//   current     rows is the last sync's list (reported is the terminal's
//               own count, which can be higher: the EA sends at most 500)
//   none        nothing open at the last sync
//   unreported  positions are open, but the last sync came from an EA that
//               does not list them
//   pending     positions are open and the EA lists them, but the last
//               list was empty (one closed or opened between the EA's two
//               reads); the next sync shows them
export function openSnapshot(rows, account) {
  const lastSync = Date.parse(account?.last_sync_at ?? "");
  if (!Number.isFinite(lastSync)) return { state: "waiting", rows: [], reported: 0 };

  const reported = Math.max(0, Math.trunc(Number(account.open_positions ?? 0)) || 0);
  const current = (Array.isArray(rows) ? rows : []).filter((r) => Date.parse(r?.updated_at ?? "") >= lastSync);
  if (current.length) return { state: "current", rows: current, reported };
  if (reported === 0) return { state: "none", rows: [], reported };
  return { state: eaReportsOpen(account.ea_version) ? "pending" : "unreported", rows: [], reported };
}
