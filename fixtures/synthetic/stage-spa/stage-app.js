// A ~30-line history router (fetch + swap) so the Stage bridge can move between pages without a document reload.
import { installStageBridge } from "/stage-bridge.js";

function applyTab() {
  const tab = new URLSearchParams(location.search).get("tab") ?? "open";
  for (const panel of document.querySelectorAll("[data-tab]")) panel.hidden = panel.dataset.tab !== tab;
  for (const link of document.querySelectorAll("[role=tab]")) link.setAttribute("aria-selected", String(new URL(link.href).searchParams.get("tab") === tab));
}
async function go(path, mode = "push") {
  const html = await (await fetch(path)).text();
  if (mode === "push") history.pushState(null, "", path); else if (mode === "replace") history.replaceState(null, "", path);
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.title = doc.title; document.body.replaceWith(document.adoptNode(doc.body)); applyTab(); autofocus();
}
// A page that focuses its first field on arrival (what a settings form or a dialog's showModal() does): the Stage must keep its keys.
const autofocus = () => document.querySelector("[data-autofocus]")?.focus();
document.addEventListener("click", (ev) => {
  const a = ev.target.closest?.("a[href]");
  if (!a || a.origin !== location.origin || ev.metaKey || ev.ctrlKey) return;
  ev.preventDefault(); go(a.pathname + a.search);
});
addEventListener("popstate", () => go(location.pathname + location.search, "none"));
applyTab(); autofocus();
installStageBridge({ navigate: (path) => go(path, "replace") });
