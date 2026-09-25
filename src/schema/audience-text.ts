/**
 * Audience text (Story Manifest v3, ADR-0008): no Node imports, so the viewer and the CLI share it.
 * A plain string is the default-locale text; an object holds one string per locale.
 */
export type Text = string | Record<string, string>;
/** An Audience Name, optionally with the evidence it was taken from (for owner review). */
export type NameValue = Text | { text: Text; source?: string };

/** The text for `locale`, else the first available one (default locale first), else "". */
export function textOf(t: Text | undefined, locale?: string, locales: readonly string[] = []): string {
  if (t == null) return "";
  if (typeof t === "string") return t;
  for (const l of [locale, ...locales]) if (l && typeof t[l] === "string") return t[l];
  return Object.values(t).find((v) => typeof v === "string") ?? "";
}
/** Unwraps `{ text, source }` name entries. */
export const nameText = (v: NameValue | undefined): Text | undefined => (v && typeof v === "object" && "text" in v ? (v as { text: Text }).text : (v as Text | undefined));
