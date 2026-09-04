import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";

import { fileURLToPath } from "node:url";
const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));

describe("ingest → layout shell navigation and derived-variable state aliases (seam)", () => {
  it("treats the root layout's nav as a shell source one hop into the component it renders, surfacing a page no other shell component reaches", async () => {
    const graph = await ingest(FIXTURE);
    const shell = graph.edges.filter((e) => e.scope === "shell");
    expect(shell.map((e) => e.target)).toContain("/about");
    const aboutEdge = shell.find((e) => e.target === "/about");
    expect(aboutEdge?.evidence.file).toBe("components/layout/site-nav.tsx");
  });

  it("treats a nested layout's nav as a shell source scoped by evidence to that layout file", async () => {
    const graph = await ingest(FIXTURE);
    const shell = graph.edges.filter((e) => e.scope === "shell");
    expect(shell.map((e) => e.target)).toContain("/team/settings");
    const settingsEdge = shell.find((e) => e.target === "/team/settings");
    expect(settingsEdge?.evidence.file).toBe("app/team/layout.tsx");
  });

  it("reads nav data written as tuples ([label, href]) inside a shell component", async () => {
    const graph = await ingest(FIXTURE);
    const shell = graph.edges.filter((e) => e.scope === "shell");
    expect(shell.find((e) => e.target === "/team")?.trigger).toBe("Nav: Team");
    expect(shell.find((e) => e.target === "/wizard")?.trigger).toBe("Nav: Wizard");
  });

  it("still emits the pre-existing shell targets discovered via the >=50% component-usage rule", async () => {
    const graph = await ingest(FIXTURE);
    const shell = graph.edges.filter((e) => e.scope === "shell");
    for (const target of ["/", "/orders", "/pricing"]) expect(shell.map((e) => e.target)).toContain(target);
  });

  it("resolves a one-hop alias of a searchParams key, then finds every explicit equality AND every array-membership literal as a tab State Screen", async () => {
    const graph = await ingest(FIXTURE);
    const ids = graph.screens.filter((s) => s.parentScreenId === "/products").map((s) => s.id).sort();
    expect(ids).toEqual(["/products?tab=faq", "/products?tab=overview", "/products?tab=pricing"]);
    for (const id of ids) expect(graph.screens.find((s) => s.id === id)?.kind).toBe("tab");
  });

  it("resolves a one-hop alias of the step searchParams key, then finds every explicit equality AND every array-membership literal as a wizard-step State Screen", async () => {
    const graph = await ingest(FIXTURE);
    const ids = graph.screens.filter((s) => s.parentScreenId === "/signup").map((s) => s.id).sort();
    expect(ids).toEqual(["/signup?step=account", "/signup?step=confirm", "/signup?step=plan"]);
    for (const id of ids) expect(graph.screens.find((s) => s.id === id)?.kind).toBe("wizard-step");
  });
});
