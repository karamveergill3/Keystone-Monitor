// The web address of a new algorithm's page (/projects/<slug>), from its
// name: lower case, letters and digits joined by hyphens, at most 40
// characters, as schema.sql's check on projects.slug requires, and never
// one already taken ("v100-2" when "v100" exists).

export const MAX_SLUG = 40;

export function projectSlug(name, taken = []) {
  const base =
    String(name ?? "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG)
      .replace(/-+$/g, "") || "algorithm";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const tail = `-${n}`;
    const slug = `${base.slice(0, MAX_SLUG - tail.length).replace(/-+$/g, "")}${tail}`;
    if (!used.has(slug)) return slug;
  }
}
