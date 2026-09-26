import { lang, nextLocale, tx } from "./audience-names.js";
import { byId, D, realTitle, routeTitle, storyPath } from "./data-model.js";
import { iconHtml } from "./icons.js";
import { evidenceFor } from "./story-player-panel.js";
import { StageFrame, type FrameStep } from "./stage-frame.js";
import { renderStagePanel, type PanelKind } from "./stage-panel.js";
import { t } from "./stage-strings.js";
import type { Story, StoryStep } from "./types.js";

export interface StageHandlers { step: (index: number) => void; grid: () => void }
/** The live app layer (stage-live-frame.ts); absent = captured only. */
export interface LiveLayer { readonly available: boolean; readonly status: string; readonly interactive: boolean; show(step: FrameStep): void; setInteractive(on: boolean): void; onChange(cb: () => void): void }

/** Presenter-only toggles; they survive step changes, reset when the Stage closes. */
export const stageUi = { panel: null as PanelKind | null, captions: true };
let root: HTMLElement | null = null; let frame: StageFrame | null = null; let live: LiveLayer | null = null; let liveFactory: ((frame: StageFrame) => LiveLayer) | null = null;
let current: { story: Story; index: number; h: StageHandlers } | null = null; let stripStory: string | null = null;

/** Registered by main.ts in serve mode when `/data/stage.json` says live is possible. */
export function useLiveLayer(factory: (frame: StageFrame) => LiveLayer): void { liveFactory = factory; }

const q = <T extends Element>(sel: string): T => root!.querySelector(sel) as T;
const stripTrigger = (trigger: string): string => trigger.replace(/^[A-Z][A-Za-z]*: /, ""); // "Link: Orders" → "Orders"
function screenTitle(id: string): string { const s = byId.get(id); return !s ? t("missing") : s.kind === "route" ? routeTitle(id) : realTitle(id); }
/** Everything one step shows: audience title, `via` trigger, caption, and the frame's inputs. */
export function stepView(story: Story, step: StoryStep, index: number): { title: string; via: string | null; caption: string; frame: FrameStep } {
  const screen = byId.get(step.screen); const edge = index > 0 ? evidenceFor(story, step.screen) : undefined;
  const title = tx(step.title) || screenTitle(step.screen);
  const url = screen ? (D.urls[step.screen] ?? (/[[#]/.test(step.screen) ? null : step.screen)) : null; // `#` overlays and unsampled [params] have no URL
  const captureSrc = screen ? D.shotUrl(step.screen) ?? D.dialogUrl(step.screen) : null;
  return { title, via: step.via ?? (edge ? stripTrigger(edge.trigger) : null), caption: tx(step.caption), frame: { id: step.screen, captureSrc, liveUrl: url, missing: !screen, alt: title } };
}

function button(cls: string, icon: Parameters<typeof iconHtml>[0], label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button"); b.type = "button"; b.className = `icon-btn stage-btn ${cls}`; b.title = label; b.setAttribute("aria-label", label); b.innerHTML = iconHtml(icon, label, 18);
  b.addEventListener("click", (ev) => { ev.stopPropagation(); onClick(); }); return b;
}

function build(): HTMLElement {
  const section = document.createElement("section"); section.className = "stage"; section.setAttribute("aria-label", t("stage"));
  section.innerHTML = `<div class="stage-body"><div class="stage-surface"></div><aside class="stage-panel" hidden aria-labelledby="stage-panel-title"></aside></div><div class="stage-caption"><span class="stage-via"></span><span class="stage-caption-text"></span></div><div class="stage-dock"><div class="stage-heading"><h2 class="stage-title"></h2><p class="stage-meta"></p></div><ol class="stage-strip" aria-label="${t("step")}"></ol><div class="stage-controls"></div></div><p class="sr-only" role="status" aria-live="polite"></p>`;
  frame = new StageFrame(); section.querySelector(".stage-surface")!.append(frame.el);
  live = liveFactory ? liveFactory(frame) : null; live?.onChange(() => update());
  const dock = section.querySelector(".stage-dock")!; dock.prepend(button("stage-back", "arrow-left", t("back"), () => current?.h.grid()));
  const controls = section.querySelector(".stage-controls")!;
  const go = (d: number): void => { if (!current) return; const n = current.index + d; if (n >= 0 && n < storyPath(current.story).length) current.h.step(n); };
  controls.append(button("stage-prev", "caret-left", t("prev"), () => go(-1)), button("stage-next", "caret-right", t("next"), () => go(1)),
    button("stage-captions", "closed-captioning", t("captions"), () => stageCommand("c")), button("stage-notes", "notepad", t("notes"), () => stageCommand("n")),
    button("stage-evidence", "file-code", t("evidence"), () => stageCommand("i")), button("stage-lang", "translate", t("language"), () => stageCommand("l")),
    button("stage-live", "broadcast", t("live"), () => stageCommand("e")), button("stage-full", "corners-out", t("fullscreen"), () => stageCommand("f")), button("stage-help", "keyboard", t("keys"), () => stageCommand("?")));
  return section;
}

/** Renders the Stage into the Play host. The section (and its frame, and a live iframe inside it) is kept across steps: re-parenting an iframe reloads it. */
export function renderStage(host: HTMLElement, story: Story, index: number, h: StageHandlers): void {
  if (!root || !host.contains(root)) { host.replaceChildren(); root = build(); host.append(root); stripStory = null; stageUi.panel = null; }
  current = { story, index, h }; update();
}

function update(): void {
  if (!root || !current) return;
  const { story, index } = current; const path = storyPath(story); const step = path[index]; if (!step) return;
  const v = stepView(story, step, index);
  q<HTMLElement>(".stage-title").textContent = v.title; q<HTMLElement>(".stage-title").title = v.title;
  const source = live?.available ? live.status : t("captured");
  // Story title, counter, source: only the title may be shortened (a long authored title must not push the counter or the source chip out of the dock).
  const metaLine = q<HTMLElement>(".stage-meta"); const parts = [["stage-story", story.title], ["stage-count", ` · ${index + 1} / ${path.length}`], ["stage-source", ` · ${source}`]].map(([cls, text]) => { const el = document.createElement("span"); el.className = cls; el.textContent = text; return el; });
  metaLine.replaceChildren(...parts); metaLine.title = metaLine.textContent ?? "";
  frame!.show(v.frame); live?.show(v.frame);
  frame!.el.dataset.hint = live?.available && v.frame.id.includes("#") ? t("openByHand") : ""; // a local-state overlay: the app shows its parent until the presenter opens it
  root.dataset.source = live?.available ? (live.interactive ? "live" : "view") : "captured";
  const caption = q<HTMLElement>(".stage-caption"); const via = q<HTMLElement>(".stage-via"); const text = q<HTMLElement>(".stage-caption-text");
  via.replaceChildren(); if (v.via) { via.append(`${t("via")} `); const b = document.createElement("b"); b.textContent = v.via; via.append(b); }
  text.textContent = v.caption && v.caption !== v.title ? v.caption : "";
  caption.hidden = !stageUi.captions || (!v.via && !text.textContent);
  renderStrip(story, index);
  const panel = q<HTMLElement>(".stage-panel"); panel.hidden = !stageUi.panel; root.classList.toggle("with-panel", !!stageUi.panel);
  if (stageUi.panel) renderStagePanel(panel, stageUi.panel, story, step, evidenceFor(story, step.screen));
  const pressed = (sel: string, on: boolean): void => q<HTMLElement>(sel).setAttribute("aria-pressed", String(on));
  pressed(".stage-captions", stageUi.captions); pressed(".stage-notes", stageUi.panel === "notes"); pressed(".stage-evidence", stageUi.panel === "evidence"); pressed(".stage-help", stageUi.panel === "keys"); pressed(".stage-live", !!live?.interactive);
  q<HTMLButtonElement>(".stage-live").disabled = !live?.available; q<HTMLButtonElement>(".stage-live").title = live?.available ? t("live") : `${t("liveUnavailable")}: ${D.stage?.reason ?? ""}`;
  q<HTMLButtonElement>(".stage-lang").hidden = lang.locales.length < 2; const langBtn = q<HTMLButtonElement>(".stage-lang"); (langBtn.querySelector(".stage-lang-label") ?? langBtn.appendChild(Object.assign(document.createElement("span"), { className: "stage-lang-label" }))).textContent = lang.locale.toUpperCase();
  q<HTMLButtonElement>(".stage-prev").disabled = index === 0; q<HTMLButtonElement>(".stage-next").disabled = index >= path.length - 1;
}

function renderStrip(story: Story, index: number): void {
  const strip = q<HTMLOListElement>(".stage-strip"); const path = storyPath(story);
  if (stripStory !== story.id + lang.locale) {
    stripStory = story.id + lang.locale; strip.replaceChildren();
    path.forEach((step, i) => {
      const v = stepView(story, step, i); const li = document.createElement("li"); const b = document.createElement("button"); b.type = "button"; b.className = "stage-thumb"; b.title = `${i + 1}. ${v.title}`; b.setAttribute("aria-label", `${t("step")} ${i + 1}: ${v.title}`);
      if (v.frame.captureSrc) { const img = document.createElement("img"); img.src = v.frame.captureSrc; img.alt = ""; img.loading = "lazy"; b.append(img); } else b.classList.add("empty");
      const n = document.createElement("span"); n.className = "stage-thumb-n"; n.textContent = String(i + 1); b.append(n);
      b.addEventListener("click", (ev) => { ev.stopPropagation(); current?.h.step(i); }); li.append(b); strip.append(li);
    });
  }
  strip.querySelectorAll<HTMLButtonElement>(".stage-thumb").forEach((b, i) => { b.classList.toggle("on", i === index); if (i === index) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
  strip.querySelectorAll<HTMLElement>(".stage-thumb")[index]?.scrollIntoView({ block: "nearest", inline: "center" });
}

const announce = (text: string): void => { if (root) q<HTMLElement>('[role="status"]').textContent = text; };
const togglePanel = (kind: PanelKind): void => { stageUi.panel = stageUi.panel === kind ? null : kind; update(); };

/** Stage keys (ADR-0008 §5). Returns true when the key was the Stage's; arrows and Home/End stay with main.ts. */
export function stageCommand(key: string): boolean {
  if (!root || !current) return false;
  switch (key) {
    case "c": stageUi.captions = !stageUi.captions; update(); return true;
    case "n": togglePanel("notes"); return true;
    case "i": togglePanel("evidence"); return true;
    case "?": togglePanel("keys"); return true;
    case "l": if (lang.locales.length < 2) return false; announce(t("localeNow") + nextLocale().toUpperCase()); stripStory = null; update(); return true;
    case "f": if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); return true;
    case "e": if (!live?.available) { announce(`${t("liveUnavailable")}: ${D.stage?.reason ?? ""}`); return true; } live.setInteractive(!live.interactive); announce(live.interactive ? t("nowLive") : t("nowView")); update(); return true;
    case "Escape": if (live?.interactive) { live.setInteractive(false); announce(t("nowView")); update(); return true; } if (stageUi.panel) { stageUi.panel = null; update(); return true; } return false;
    case "Home": current.h.step(0); return true;
    case "End": current.h.step(storyPath(current.story).length - 1); return true;
    default: return false;
  }
}

/** Keyboard entry from main.ts while the Stage is open. */
export function stageKey(ev: KeyboardEvent): boolean {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  const handled = stageCommand(key); if (handled) ev.preventDefault(); return handled;
}
