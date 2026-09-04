/** route matcher: exact path, or a `/prefix/**` glob covering the prefix and everything under it. */
export function globMatch(pattern: string, routeId: string): boolean {
  return pattern.endsWith("/**") ? routeId === pattern.slice(0, -3) || routeId.startsWith(pattern.slice(0, -3) + "/") : routeId === pattern;
}

/**
 * route id → feature id. The one documented fallback, shared by the viewer and both CLI commands
 * (round-1 review: 3 drifting copies of this same two-liner): first `match` pattern wins, else the
 * route's top URL segment, else `fallback` ("account" by default, for routes with no segment at all).
 */
export function featureIdFor(routeId: string, features: { id: string; match: string[] }[], fallback = "account"): string {
  for (const f of features) if (f.match.some((p) => globMatch(p, routeId))) return f.id;
  return routeId.split("/")[1] || fallback;
}
