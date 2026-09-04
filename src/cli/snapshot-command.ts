import { resolve } from "node:path";
import { loadConfig } from "../schema/code2flow-config.js";
import { readGraph, runSnapshot, type SnapshotSummary } from "../snapshot/snapshot-runner.js";

/** `code2flow snapshot <repo> --url http://127.0.0.1:PORT [--storage-state file] [--concurrency 4] [--headed]`. A saved `code2flow login` session is used automatically. */
export async function snapshotCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<SnapshotSummary> {
  const rootDir = resolve(repoArg);
  const config = loadConfig(rootDir);
  const serverUrl = typeof flags.url === "string" ? flags.url : config.serverUrl;
  if (!serverUrl) throw new Error("snapshot: pass --url http://127.0.0.1:PORT (the target's dev server, started by you) or set serverUrl in code2flow.config.json");
  const { graph, samples } = readGraph(rootDir);
  return runSnapshot(rootDir, graph, samples, config, {
    serverUrl,
    storageState: typeof flags["storage-state"] === "string" ? flags["storage-state"] : undefined,
    concurrency: typeof flags.concurrency === "string" ? Number(flags.concurrency) : undefined,
    headless: flags.headed !== true,
    log,
  });
}
