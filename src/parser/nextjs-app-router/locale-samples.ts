import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bump, type Counters } from "../../schema/index.js";

const ROUTING_FILES = ["src/i18n/routing.ts", "i18n/routing.ts", "src/i18n/config.ts", "src/i18n.ts", "i18n.ts", "src/middleware.ts", "middleware.ts"];
const LOCALE_PARAM = /\[(locale|lang|language)\]/;

/**
 * The locale a `[locale]` segment should be sampled with: next-intl's `defaultLocale` (or the first of `locales`)
 * from the routing file, else the first `messages/<locale>.json`. Null when the repo gives no hint; the guess is counted.
 */
export function inferDefaultLocale(rootDir: string, counters: Counters): string | null {
  for (const rel of ROUTING_FILES) {
    const file = join(rootDir, rel); if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const def = src.match(/defaultLocale\s*:\s*["'`]([A-Za-z][\w-]*)["'`]/);
    if (def) { bump(counters, rel, "locale-default-from-routing"); return def[1]; }
    const list = src.match(/locales\s*:\s*\[([^\]]*)\]/);
    const first = list?.[1].match(/["'`]([A-Za-z][\w-]*)["'`]/);
    if (first) { bump(counters, rel, "locale-default-guessed-first"); return first[1]; }
  }
  const messages = join(rootDir, "messages");
  if (existsSync(messages)) {
    const names = readdirSync(messages).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
    if (names.length) { bump(counters, "messages", "locale-default-guessed-first"); return names[0]; }
  }
  return null;
}

/** Every locale the app declares (`locales: [...]` in the routing file, else messages/*.json); empty when unknown. */
export function knownLocales(rootDir: string): string[] {
  for (const rel of ROUTING_FILES) {
    const file = join(rootDir, rel); if (!existsSync(file)) continue;
    const list = readFileSync(file, "utf8").match(/locales\s*:\s*\[([^\]]*)\]/);
    if (list) return [...list[1].matchAll(/["'`]([A-Za-z][\w-]*)["'`]/g)].map((m) => m[1]);
  }
  const messages = join(rootDir, "messages");
  return existsSync(messages) ? readdirSync(messages).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
}

/** `/[locale]/about` → `/vi/about` when the locale is the only dynamic segment; other params stay for later discovery. */
export function localeSampleFor(routeId: string, locale: string): string | null {
  if (!LOCALE_PARAM.test(routeId)) return null;
  const sampled = routeId.replace(LOCALE_PARAM, locale);
  return /\[/.test(sampled) ? null : sampled;
}
