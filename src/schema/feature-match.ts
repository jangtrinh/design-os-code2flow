/** route matcher: exact path, or a `/prefix/**` glob covering the prefix and everything under it. */
export function globMatch(pattern: string, routeId: string): boolean {
  return pattern.endsWith("/**") ? routeId === pattern.slice(0, -3) || routeId.startsWith(pattern.slice(0, -3) + "/") : routeId === pattern;
}

const LOCALE_SEGMENT = /^\[(locale|lang|language)\]$/;

/** Top URL segment that names a feature: a leading `[locale]`-style segment is skipped (`/[locale]/kien-thuc/x` → `kien-thuc`). */
export function routeTopSegment(routeId: string): string {
  const segs = routeId.split("/").filter(Boolean);
  if (segs.length && LOCALE_SEGMENT.test(segs[0])) segs.shift();
  return segs[0] ?? "";
}

/** `/[locale]` → `/`, `/[locale]/x` → `/x`: the route as the user sees it without the locale prefix. */
export function withoutLocaleSegment(routeId: string): string {
  const segs = routeId.split("/").filter(Boolean);
  if (segs.length && LOCALE_SEGMENT.test(segs[0])) segs.shift();
  return "/" + segs.join("/");
}

/**
 * route id → feature id. The one documented fallback, shared by the viewer and both CLI commands
 * (round-1 review: 3 drifting copies of this same two-liner): first `match` pattern wins, else the
 * route's top URL segment, else `fallback` ("account" by default, for routes with no segment at all).
 */
export function featureIdFor(routeId: string, features: { id: string; match: string[] }[], fallback = "account"): string {
  for (const f of features) if (f.match.some((p) => globMatch(p, routeId))) return f.id;
  return routeTopSegment(routeId) || fallback;
}
