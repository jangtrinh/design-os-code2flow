import { nameText, textOf } from "../schema/audience-text.js";
import type { Feature, NameValue, Story, Text, ViewerData } from "./types.js";

/**
 * Audience Names and the viewer locale (ADR-0008 §2, §7). Every view asks here first, so what the audience reads
 * is the authored name (`names` in the Story Manifest) in the current locale, else the captured title.
 */
export const lang = { locale: "en", locales: ["en"] as string[] };
let names: Record<string, NameValue> = {};
let stories: Story[] = []; let features: Feature[] = [];
const STORE = "c2f-stage-locale";

const readStored = (): string | null => { try { return localStorage.getItem(STORE); } catch { return null; } };
const store = (value: string): void => { try { localStorage.setItem(STORE, value); } catch { /* storage blocked: the locale lasts for this page only */ } };

/** Current-locale string of a manifest Text. */
export const tx = (t: Text | undefined): string => textOf(t, lang.locale, lang.locales);
/** The authored name of a feature id or screen id in the current locale, or null. */
export const audienceName = (id: string): string | null => { const v = names[id]; return v === undefined ? null : tx(nameText(v)) || null; };

/** Once per load: remembers the manifest's raw texts so every locale switch starts from them. */
export function initAudience(data: ViewerData): void {
  names = data.names ?? {}; stories = data.stories; features = data.features;
  lang.locales = data.locales?.length ? data.locales : ["en"];
  const stored = readStored(); lang.locale = stored && lang.locales.includes(stored) ? stored : lang.locales[0];
  for (const st of stories) if (st.titleText === undefined) st.titleText = st.title as unknown as Text;
  for (const f of features) if (f.baseTitle === undefined) f.baseTitle = f.title;
  applyLocale();
}

/** Story and feature titles are plain strings for every view; recompute them for the current locale. */
function applyLocale(): void {
  for (const st of stories) st.title = tx(st.titleText) || st.id;
  for (const f of features) f.title = audienceName(f.id) ?? f.baseTitle ?? f.id;
}

/** Switches to the next manifest locale; returns it. */
export function nextLocale(): string {
  const i = lang.locales.indexOf(lang.locale); lang.locale = lang.locales[(i + 1) % lang.locales.length];
  store(lang.locale); applyLocale(); return lang.locale;
}
