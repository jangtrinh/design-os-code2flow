export function hrefWith(pathname: string, sp: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  return p.size ? `${pathname}?${p}` : pathname;
}
