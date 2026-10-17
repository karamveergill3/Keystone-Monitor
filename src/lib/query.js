// Builds a link to the same page with some query parameters changed.
// A value of null removes that parameter.
export function hrefWith(path, current, changes) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current ?? {})) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function pageNumber(value) {
  const n = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : 1;
}
