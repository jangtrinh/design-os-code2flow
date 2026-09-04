import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `code2flow.config.json` — optional, lives in the target repo root. Everything has a default so
 * a repo with no config still works; the config exists for what static analysis cannot know.
 */
export interface FeatureConfig {
  id: string;
  title: string;
  /** route matchers: exact path or `/prefix/**` */
  match: string[];
  order?: number;
}

export interface CaptureConfig {
  baseWidth: number;
  baseHeight: number;
  capWidth: number;
  capHeight: number;
  /** JPEG quality 1–100 */
  quality: number;
}

export interface Code2FlowConfig {
  features?: FeatureConfig[];
  /** concrete sample URLs for dynamic routes the parser cannot resolve: { "/users/[id]": ["/users/alice"] } */
  routeExamples?: Record<string, string[]>;
  capture: CaptureConfig;
  /** Playwright storageState file for apps behind a login */
  storageState?: string;
  /** dev server the snapshot command should hit, e.g. http://127.0.0.1:3000 */
  serverUrl?: string;
  /** command `run` starts when it owns the target repo's configured serverUrl */
  devCommand?: string;
}

export const CONFIG_FILE = "code2flow.config.json";

export const DEFAULT_CAPTURE: CaptureConfig = { baseWidth: 1440, baseHeight: 900, capWidth: 2200, capHeight: 10000, quality: 65 };

const FEATURE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
/** Feature ids end up in export filenames and the viewer's hash router: reject anything that isn't a plain slug. */
export function assertValidFeatureIds(features: FeatureConfig[] | undefined, file: string): void {
  for (const f of features ?? []) if (!FEATURE_ID_RE.test(f.id)) throw new Error(`${file}: invalid feature id "${f.id}" (must match ${FEATURE_ID_RE})`);
}

/** Reads the target repo's config, filling defaults; a missing file is normal, an invalid one is an error the CLI reports. */
export function loadConfig(rootDir: string): Code2FlowConfig {
  const file = join(rootDir, CONFIG_FILE);
  if (!existsSync(file)) return { capture: { ...DEFAULT_CAPTURE } };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${(err as Error).message}`);
  }
  if (!raw || typeof raw !== "object") throw new Error(`${CONFIG_FILE} must contain a JSON object`);
  const cfg = raw as Partial<Code2FlowConfig>;
  assertValidFeatureIds(cfg.features, CONFIG_FILE);
  return { ...cfg, capture: { ...DEFAULT_CAPTURE, ...(cfg.capture ?? {}) } };
}
