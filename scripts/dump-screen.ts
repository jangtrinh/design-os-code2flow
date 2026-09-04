/** Debug helper: prints screens, edges and counters touching the given screen ids. Usage: tsx scripts/dump-screen.ts <repo> <screenId...> */
import { ingest } from "../src/parser/ingest.js";
const [repo, ...ids] = process.argv.slice(2);
const graph = await ingest(repo);
for (const id of ids) {
  console.log(`\n### ${id}`);
  for (const s of graph.screens.filter((s) => s.id === id || s.parentScreenId === id)) console.log(`  screen ${s.kind.padEnd(11)} ${s.id}${s.routeAsModal ? " [routeAsModal]" : ""}`);
  for (const e of graph.edges.filter((e) => e.source === id || e.source.startsWith(id + "?") || e.source.startsWith(id + "#"))) console.log(`  edge ${e.confidence.padEnd(6)} ${e.source} -> ${e.target}  [${e.pattern}] ${e.trigger} @${e.evidence.file}:${e.evidence.line}`);
  for (const [file, c] of Object.entries(graph.counters)) if (file.includes(id === "/" ? "app/page" : id.replace(/\[|\]/g, ""))) console.log(`  counters ${file} ${JSON.stringify(c)}`);
}
