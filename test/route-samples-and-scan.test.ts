import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scanCommand } from "../src/cli/scan-command.js";
import { parseArgs } from "../src/cli/index.js";
import { copyFixture } from "./helpers/fixture-copy.js";

const fx = copyFixture("scan"); const FIXTURE = fx.dir;
afterAll(() => fx.cleanup());

describe("code2flow scan (seam: CLI → .code2flow files)", () => {
  it("writes graph.json and route-samples.json with samples from code literals and config", async () => {
    const lines: string[] = [];
    const r = await scanCommand(FIXTURE, (l) => lines.push(l));
    expect(existsSync(join(r.outDir, "graph.json"))).toBe(true);
    const samples = JSON.parse(readFileSync(join(r.outDir, "route-samples.json"), "utf8"));
    expect(samples.samples["/blog/[slug]"]).toEqual(expect.arrayContaining(["/blog/hello-world", "/blog/second-post", "/blog/new-post"])); // data-array + form-action literals in code
    expect(samples.samples["/docs/[...parts]"]).toEqual(["/docs/getting-started", "/docs/getting-started/install"]); // router.push literal in code, then code2flow.config.json
    expect(samples.needsSample).toEqual(["/[bracket"]); // no literal anywhere and no config example: counted, not hidden
    const graph = JSON.parse(readFileSync(join(r.outDir, "graph.json"), "utf8"));
    expect(graph.counters["code2flow.config.json"]["route-example-unknown-route"]).toBe(1); // "/nope/[x]" is not a route: counted, not hidden
    expect(graph.counters["code2flow.config.json"]["route-example-not-matching-route"]).toBe(2); // "not-a-path" and "/docs/wrong-route" do not match /blog/[slug]
    expect(samples.samples["/blog/[slug]"]).not.toContain("not-a-path");
    expect(lines.join("\n")).toMatch(/2 routeExamples ignored/);
    expect(lines.join("\n")).toMatch(/route samples: 2 dynamic routes have samples, 1 need one/);
    expect(lines.join("\n")).toMatch(/adapter: Next\.js App Router/);
  });
  it("parses argv into command, positionals and flags", () => {
    expect(parseArgs(["snapshot", "/repo", "--url", "http://127.0.0.1:3000", "--headed"])).toEqual({ command: "snapshot", positionals: ["/repo"], flags: { url: "http://127.0.0.1:3000", headed: true }, errors: [] });
    expect(parseArgs(["export", "/repo", "--feature", "--out", "x"]).errors).toEqual(["--feature needs a value"]); // never silently `true`
  });
});
