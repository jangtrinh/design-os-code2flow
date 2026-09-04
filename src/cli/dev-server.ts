import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { spawn, type ChildProcess } from "node:child_process";

const POLL_MS = 200;

export function serverAnswers(serverUrl: string): Promise<boolean> {
  let parsed: URL;
  try { parsed = new URL(serverUrl); } catch { return Promise.resolve(false); }
  return new Promise((done) => {
    const requester = parsed.protocol === "https:" ? httpsRequest : request;
    const req = requester(parsed, { rejectUnauthorized: false }, (res) => { res.resume(); done(true); });
    req.setTimeout(1_000, () => { req.destroy(); done(false); });
    req.once("error", () => done(false)); req.end();
  });
}

export function portFor(serverUrl: string): string {
  const url = new URL(serverUrl);
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

export interface StartedServer { process: ChildProcess; output: () => string; failure: () => string | undefined }

/** Detached process groups let `run` clean up npm's child server, not merely its shell. */
export function startDevServer(command: string, cwd: string): StartedServer {
  let output = "";
  let failure: string | undefined;
  const child = spawn(command, { cwd, shell: true, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const collect = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-800); };
  child.stdout?.on("data", collect); child.stderr?.on("data", collect);
  child.once("exit", (code, signal) => { failure = `dev command exited ${signal ?? code ?? "unknown"}`; });
  child.once("error", (error) => { failure = `dev command failed: ${error.message}`; });
  return { process: child, output: () => output, failure: () => failure };
}

export async function waitForServer(serverUrl: string, output: () => string, failure: () => string | undefined = () => undefined, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverAnswers(serverUrl)) return;
    if (failure()) throw new Error(`${failure()}; last output: ${output().slice(-800)}`);
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
  throw new Error(`server at ${serverUrl} did not answer within ${Math.ceil(timeoutMs / 1_000)}s; last output: ${output().slice(-800)}`);
}

/** Always reap an owned detached group. Escalate only if the target URL still responds after SIGTERM. */
export async function stopDevServer(child: ChildProcess, serverUrl: string): Promise<void> {
  if (child.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* the group already exited */ } }
  await new Promise((done) => setTimeout(done, 1_500));
  if (await serverAnswers(serverUrl) && child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already stopped */ } }
}
