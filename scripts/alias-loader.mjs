// Resolves "@/x/y" to "<repo>/src/x/y.js", matching the paths mapping in
// jsconfig.json. Deliberately narrow: only the one prefix, and only the
// .js extension the lib modules use, so a typo fails loudly at import
// rather than silently resolving somewhere unexpected.
const SRC = new URL("../src/", import.meta.url);

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(new URL(`${specifier.slice(2)}.js`, SRC).href, context);
  }
  return next(specifier, context);
}
