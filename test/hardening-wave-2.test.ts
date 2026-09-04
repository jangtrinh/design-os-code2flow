import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanCommand } from "../src/cli/scan-command.js";
import { snapshotCommand } from "../src/cli/snapshot-command.js";
import { DEFAULT_CAPTURE, loadConfig, type Code2FlowConfig } from "../src/schema/code2flow-config.js";
import { featureIdFor, globMatch, type CanonicalFlowGraph } from "../src/schema/index.js";
import { loadManifest } from "../src/schema/story-manifest.js";
import { resolveStorageState } from "../src/snapshot/snapshot-runner.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { D, defaultFeatures, featureOf, initData } from "../src/viewer/data-model.js";
import type { ViewerData } from "../src/viewer/types.js";
import { copyFixture } from "./helpers/fixture-copy.js";
import { startStaticApp } from "./helpers/static-app-server.js";

const graphWith = (screens: { id: string; kind: "route" | "modal" | "tab" | "wizard-step"; parentScreenId?: string }[]): CanonicalFlowGraph => ({
  version: 1, framework: "nextjs-app-router", rootDir: "/x", edges: [], counters: {},
  screens: screens.map((s) => ({ ...s, filePath: "app/x/page.tsx" })),
});
const viewerData = (over: Partial<ViewerData>): ViewerData => ({ graph: graphWith([]), meta: {}, titles: {}, urls: {}, stories: [], features: [], shotUrl: () => null, dialogUrl: () => null, productName: "x", ...over });

describe("data-model initData: v2 story screens derived from steps/branches (round-1 finding: navigation.ts:19 crash)", () => {
  it("derives `screens` when the manifest omits it, from the main path and every branch", () => {
    const graph = graphWith([{ id: "/a", kind: "route" }, { id: "/b", kind: "route" }, { id: "/c", kind: "route" }]);
    const story = { id: "s1", title: "S1", entry: "/a", screens: undefined as unknown as string[], steps: ["/a", { screen: "/b", via: "Next" }], branches: [{ title: "alt", from: "/a", steps: ["/c"] }] };
    initData(viewerData({ graph, stories: [story], features: [{ id: "app", title: "App", match: [], order: 0 }] }));
    expect(D.stories[0].screens).toEqual(["/a", "/b", "/c"]);
  });
  it("leaves an explicit `screens` array untouched", () => {
    const graph = graphWith([{ id: "/a", kind: "route" }]);
    const story = { id: "s1", title: "S1", entry: "/a", screens: ["/a"], steps: ["/a", "/b"] };
    initData(viewerData({ graph, stories: [story], features: [{ id: "app", title: "App", match: [], order: 0 }] }));
    expect(D.stories[0].screens).toEqual(["/a"]);
  });
});

describe("data-model featureOf: never returns an id absent from D.features", () => {
  it("falls back to a real feature instead of silently dropping the route from the map/inspect views", () => {
    const graph = graphWith([{ id: "/only/x", kind: "route" }, { id: "/other/y", kind: "route" }]);
    const features = [{ id: "only", title: "Only", match: ["/only/**"], order: 0 }];
    initData(viewerData({ graph, features }));
    expect(featureOf("/only/x")).toBe("only");
    expect(featureOf("/other/y")).toBe("only"); // segment "other" is not a registered feature id: safety-net fallback, never a dangling id
  });
});

describe("data-model default features: one non-empty feature per Route Screen", () => {
  it("keeps login Route Screens in Access without creating an empty Login feature", () => {
    const graph = graphWith([{ id: "/login", kind: "route" }, { id: "/catalog", kind: "route" }]);
    const features = defaultFeatures(graph.screens.map((screen) => screen.id));
    initData(viewerData({ graph, features }));
    expect(features.map((feature) => feature.id)).toEqual(["access", "catalog"]);
    expect(graph.screens.map((screen) => featureOf(screen.id))).toEqual(["access", "catalog"]);
  });
});

describe("schema/feature-match: single shared featureOf implementation (round-1 finding: 3 drifting copies)", () => {
  it("globMatch: exact path, or /prefix/** covering the prefix and everything under it", () => {
    expect(globMatch("/billing", "/billing")).toBe(true);
    expect(globMatch("/billing", "/billing/x")).toBe(false);
    expect(globMatch("/billing/**", "/billing")).toBe(true);
    expect(globMatch("/billing/**", "/billing/plans")).toBe(true);
    expect(globMatch("/billing/**", "/other")).toBe(false);
  });
  it("featureIdFor: match wins, else top segment, else the fallback", () => {
    const features = [{ id: "billing", match: ["/billing/**"] }];
    expect(featureIdFor("/billing/plans", features)).toBe("billing");
    expect(featureIdFor("/settings", features)).toBe("settings"); // top segment, unconditionally
    expect(featureIdFor("/", features)).toBe("account"); // no segment: default fallback
    expect(featureIdFor("/", features, "app")).toBe("app"); // caller-supplied fallback
  });
});

describe("resolveStorageState (pure: path resolution only)", () => {
  const fx = copyFixture("storage-state");
  const cfg: Code2FlowConfig = { capture: DEFAULT_CAPTURE };
  afterAll(() => fx.cleanup());
  it("resolves a relative flag/config path against rootDir, not process.cwd()", () => {
    const rel = ".code2flow/my-state.json";
    mkdirSync(join(fx.dir, ".code2flow"), { recursive: true }); writeFileSync(join(fx.dir, rel), "{}");
    expect(resolveStorageState(fx.dir, rel, cfg)).toBe(join(fx.dir, rel));
  });
  it("throws when the given path does not exist", () => {
    expect(() => resolveStorageState(fx.dir, "nope.json", cfg)).toThrow(/storage state file not found/);
  });
  it("picks the default .code2flow/storage-state.json when present and nothing was passed", () => {
    const dflt = join(fx.dir, ".code2flow", "storage-state.json"); writeFileSync(dflt, "{}");
    expect(resolveStorageState(fx.dir, undefined, cfg)).toBe(dflt);
  });
  it("returns undefined when nothing is configured and no default file exists", () => {
    const fx2 = copyFixture("storage-state-empty");
    try { expect(resolveStorageState(fx2.dir, undefined, cfg)).toBeUndefined(); } finally { fx2.cleanup(); }
  });
});

describe("feature ids from the target repo are validated at the source (round-1 finding: export-command.ts:61 path escape via --feature)", () => {
  it("loadManifest rejects a path-traversal feature id instead of letting it reach the export filename", () => {
    const fx = copyFixture("feature-id-manifest");
    try {
      writeFileSync(join(fx.dir, "code2flow.stories.json"), JSON.stringify({ version: 2, features: [{ id: "../../../escaped", title: "x", match: ["/x"] }], stories: [] }));
      expect(() => loadManifest(fx.dir)).toThrow(/invalid feature id "\.\.\/\.\.\/\.\.\/escaped"/);
    } finally { fx.cleanup(); }
  });
  it("loadConfig rejects the same", () => {
    const fx = copyFixture("feature-id-config");
    try {
      writeFileSync(join(fx.dir, "code2flow.config.json"), JSON.stringify({ features: [{ id: "Not Valid!", title: "x", match: ["/x"] }] }));
      expect(() => loadConfig(fx.dir)).toThrow(/invalid feature id/);
    } finally { fx.cleanup(); }
  });
});

describe("scan: one-time hint when the target repo's .gitignore does not cover .code2flow/", () => {
  it("prints the hint when .gitignore is missing", async () => {
    const fx = copyFixture("gitignore-missing");
    try { const lines: string[] = []; await scanCommand(fx.dir, (l) => lines.push(l)); expect(lines.join("\n")).toMatch(/hint: add \.code2flow\/ to .*\.gitignore/); }
    finally { fx.cleanup(); }
  });
  it("stays silent when .gitignore already covers .code2flow", async () => {
    const fx = copyFixture("gitignore-present");
    try { writeFileSync(join(fx.dir, ".gitignore"), "node_modules\n.code2flow/\n"); const lines: string[] = []; await scanCommand(fx.dir, (l) => lines.push(l)); expect(lines.join("\n")).not.toMatch(/hint:/); }
    finally { fx.cleanup(); }
  });
});

describe("snapshot: pruneStaleShots + capture-capped (seam: CLI → .code2flow/shots + graph.json counters)", () => {
  let app: Awaited<ReturnType<typeof startStaticApp>>;
  const fx = copyFixture("snapshot-wave2");
  beforeAll(async () => { app = await startStaticApp(); });
  afterAll(() => { app.server.close(); fx.cleanup(); });

  it("removes a stale shot file that belongs to no current screen, and always writes snapshot-run.json", async () => {
    await scanCommand(fx.dir, () => {});
    const shotsDir = join(fx.dir, ".code2flow", "shots"); mkdirSync(shotsDir, { recursive: true });
    const stale = join(shotsDir, "deadbeefdeadbeef.jpg"); writeFileSync(stale, "not a real jpeg");
    await snapshotCommand(fx.dir, { url: app.url, concurrency: "2" }, () => {});
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(join(fx.dir, ".code2flow", "snapshot-run.json"))).toBe(true);
  }, 120000);

  it("counts and flags a capture that hits the configured height cap", async () => {
    writeFileSync(join(fx.dir, "code2flow.config.json"), JSON.stringify({ capture: { capHeight: 1200 } }));
    await scanCommand(fx.dir, () => {});
    await snapshotCommand(fx.dir, { url: app.url, concurrency: "2" }, () => {});
    const graph = JSON.parse(readFileSync(join(fx.dir, ".code2flow", "graph.json"), "utf8"));
    expect(graph.counters.snapshot?.["capture-capped"]).toBeGreaterThanOrEqual(1);
    const meta = JSON.parse(readFileSync(join(fx.dir, ".code2flow", "shots-meta.json"), "utf8"));
    expect(meta["/orders"].clippedAtCap).toBe(true);
    expect(existsSync(shotFiles(join(fx.dir, ".code2flow", "shots"), "/orders").full)).toBe(true);
  }, 120000);
});
