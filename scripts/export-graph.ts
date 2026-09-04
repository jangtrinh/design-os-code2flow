/** Writes the CanonicalFlowGraph of a target repo to <repo>/.code2flow/graph.json. Usage: npm run graph -- <repoRoot> */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ingest } from "../src/parser/ingest.js";

const repo = resolve(process.argv[2] ?? ".");
const graph = await ingest(repo);
const outDir = join(repo, ".code2flow");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "graph.json"), JSON.stringify(graph, null, 2));
console.log(`${graph.screens.length} screens, ${graph.edges.length} edges → ${join(outDir, "graph.json")}`);
