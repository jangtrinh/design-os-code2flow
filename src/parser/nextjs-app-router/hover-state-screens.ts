import type { ActionEdge, Counters, ScreenKind, ScreenNode } from "../../schema/index.js";
import type { ScreenIndex } from "./screen-index.js";

interface HoverExtraction { states: ScreenNode[]; edges: Omit<ActionEdge, "id">[] }

/** Extracts literal hover-opened overlays. CSS-only reveals remain counters because no reliable Action Trigger exists. */
export function extractHoverStateScreens(index: ScreenIndex, counters: Counters): HoverExtraction {
  const states: ScreenNode[] = []; const edges: Omit<ActionEdge, "id">[] = [];
  for (const file of index.files) {
    const source = file.source;
    const cssOnly = source.match(/className\s*=\s*["'][^"']*hover:/g) ?? [];
    for (const _ of cssOnly) bump(counters, file.file, "hover-trigger-unresolved");
    const candidates = [
      ...matches(source, /<(Tooltip|HoverCard|DropdownMenu)\b[\s\S]*?<\1(?:Content|Content|)\b/g, "radix"),
      ...matches(source, /onMouseEnter\s*=/g, "mouse-enter"),
    ];
    for (const candidate of candidates) {
      const before = source.slice(Math.max(0, candidate.index - 500), candidate.index + 800);
      const selector = selectorFor(before, candidate.kind === "mouse-enter" ? source.slice(source.lastIndexOf("<", candidate.index), source.indexOf(">", candidate.index) + 1) : undefined);
      if (!selector) { bump(counters, file.file, "hover-trigger-unresolved"); continue; }
      const type = candidate.kind === "mouse-enter" ? "popover" : kindFor(candidate.text);
      const slug = slugFor(type, selector, states.length);
      const id = `${index.screen.id}#hover-${slug}`;
      if (states.some((state) => state.id === id)) continue;
      states.push({ id, kind: type, parentScreenId: index.screen.id, label: `${humanize(slug)} ${type}`, filePath: file.file, hoverTriggerSelector: selector });
      edges.push({ source: index.screen.id, target: id, trigger: `hover: ${humanize(slug)}`, triggerKind: "hover", confidence: candidate.kind === "mouse-enter" ? "high" : "high", pattern: candidate.kind === "mouse-enter" ? "on-mouse-enter-hover-overlay" : `radix-${type}-hover-overlay`, evidence: { file: file.file, line: lineOf(source, candidate.index), snippet: candidate.text.slice(0, 120) }, scope: "screen", resolved: true });
    }
  }
  return { states, edges };
}

function matches(source: string, pattern: RegExp, kind: string): { index: number; text: string; kind: string }[] { return [...source.matchAll(pattern)].map((m) => ({ index: m.index ?? 0, text: m[0], kind })); }
function kindFor(text: string): Exclude<ScreenKind, "route" | "modal" | "tab" | "wizard-step"> { return text.includes("HoverCard") ? "popover" : text.includes("DropdownMenu") ? "dropdown" : "tooltip"; }
function selectorFor(source: string, exactTag?: string): string | null {
  const trigger = exactTag ?? /<(?:Tooltip|HoverCard|DropdownMenu)Trigger\b[^>]*>/.exec(source)?.[0] ?? "";
  const test = /data-testid=["']([^"']+)["']/.exec(trigger); if (test) return `[data-testid="${test[1]}"]`;
  const id = /\bid=["']([^"']+)["']/.exec(trigger); return id ? `#${id[1]}` : null;
}
function slugFor(kind: string, selector: string, n: number): string { return `${kind}-${selector.replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").toLowerCase() || n}`; }
function humanize(value: string): string { return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function lineOf(source: string, offset: number): number { return source.slice(0, offset).split("\n").length; }
function bump(counters: Counters, file: string, name: string): void { counters[file] ??= {}; counters[file][name] = (counters[file][name] ?? 0) + 1; }
