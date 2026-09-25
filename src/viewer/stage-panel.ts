import { tx } from "./audience-names.js";
import { iconHtml } from "./icons.js";
import { t } from "./stage-strings.js";
import type { ActionEdge } from "../schema/index.js";
import type { Story, StoryStep } from "./types.js";

export type PanelKind = "notes" | "evidence" | "keys";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** Presenter-only side panel: notes (cue + note), evidence (via, confidence, file:line, snippet), or the shortcut list. Text only, never markup from data. */
export function renderStagePanel(panel: HTMLElement, kind: PanelKind, story: Story, step: StoryStep, edge: ActionEdge | undefined): void {
  panel.replaceChildren();
  const heading = el("h2", "stage-panel-title", kind === "notes" ? t("notesTitle") : kind === "evidence" ? t("evidenceTitle") : t("keysTitle")); heading.id = "stage-panel-title"; panel.append(heading);
  if (kind === "notes") {
    const cue = tx(step.cue), note = tx(step.note), about = tx(story.description);
    const block = (label: string, text: string): void => { const d = el("div", "stage-note"); d.append(el("p", "stage-note-label", label), el("p", "stage-note-text", text)); panel.append(d); };
    if (cue) block(t("cue"), cue); if (note) block(t("note"), note);
    if (!cue && !note) panel.append(el("p", "stage-note-empty", t("noNotes")));
    if (about) block(`${t("story")} · ${story.title}`, about);
    return;
  }
  if (kind === "evidence") {
    const trig = el("p", "stage-evidence-trigger-label"); trig.innerHTML = iconHtml("cursor-click", "Action trigger", 16); trig.append(el("span", "", step.via ?? edge?.trigger ?? t("notInCode"))); panel.append(trig);
    if (edge) {
      const meta = el("p", "stage-evidence-meta mono"); meta.append(el("span", `confidence-chip ${edge.confidence}`, edge.confidence), el("span", "", ` ${edge.evidence.file}:${edge.evidence.line}`)); panel.append(meta);
      if (edge.evidence.snippet) panel.append(el("pre", "stage-evidence-snippet", edge.evidence.snippet));
    } else panel.append(el("p", "stage-note-empty", t("notInCode")));
    const id = el("p", "stage-evidence-id"); id.append(el("span", "stage-note-label", t("route")), el("code", "mono", step.screen)); panel.append(id);
    return;
  }
  const list = el("dl", "stage-keys");
  for (const [k, label] of [["← →", t("kArrows")], ["Home End", t("kHomeEnd")], ["E", t("live")], ["C", t("captions")], ["N", t("notes")], ["I", t("evidence")], ["L", t("language")], ["F", t("fullscreen")], ["Esc", t("kEsc")]] as const) {
    const row = el("div", "stage-keys-row"); row.append(el("dt", "mono", k), el("dd", "", label.replace(/ \(.+\)$/, ""))); list.append(row);
  }
  panel.append(list);
}
