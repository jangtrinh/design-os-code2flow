import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isLoopbackUrl } from "./stage-bridge-protocol.js";

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

/** Scripted sign-in: only the NAMES of the env vars holding the credentials live here; values are read at run time. */
export interface LoginConfig {
  /** login page path, default /login */
  path?: string;
  emailEnv: string;
  passwordEnv: string;
  /** path the app lands on after a successful sign-in; default = any path other than `path` */
  successUrl?: string;
  /** CSS selectors when auto-detection (input[type=email], input[type=password], submit button) is not enough */
  selectors?: { email?: string; password?: string; submit?: string };
}

/** Presenter Stage (ADR-0008): where the live app runs and how its frame URL is built. Live is loopback-only. */
export interface StageConfig {
  /** live app URL; default `serverUrl`. Must be http(s) on 127.0.0.1, localhost or [::1]. */
  url?: string;
  /** false = the Stage always shows captured Screen Previews */
  live?: boolean;
  /** extra query parameters for every frame URL, e.g. { "review": "0" } */
  frameQuery?: Record<string, string>;
  /** query parameter that carries the Stage locale into the app, e.g. "lang" */
  localeParam?: string;
}

export interface Code2FlowConfig {
  /** Presenter Stage live frame (see StageConfig) */
  stage?: StageConfig;
  /** locale used to sample `[locale]` routes when the inferred default is wrong (e.g. the default locale redirect-loops locally) */
  locale?: string;
  /** scripted login for apps behind auth (see LoginConfig) */
  login?: LoginConfig;
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
  assertValidStage(cfg.stage);
  return { ...cfg, capture: { ...DEFAULT_CAPTURE, ...(cfg.capture ?? {}) } };
}

/** The Stage frames a live app only on this machine (ADR-0001/0008): anything else is a config error, not a silent fallback. */
export function assertValidStage(stage: StageConfig | undefined): void {
  if (stage == null) return;
  if (typeof stage !== "object") throw new Error(`${CONFIG_FILE}: "stage" must be an object`);
  if (stage.url !== undefined && (typeof stage.url !== "string" || !isLoopbackUrl(stage.url))) throw new Error(`${CONFIG_FILE}: stage.url "${String(stage.url)}" must be an http(s) URL on 127.0.0.1, localhost or [::1] (the Stage never frames another machine)`);
  if (stage.frameQuery !== undefined && (typeof stage.frameQuery !== "object" || Object.values(stage.frameQuery).some((v) => typeof v !== "string"))) throw new Error(`${CONFIG_FILE}: stage.frameQuery must map names to strings`);
  if (stage.localeParam !== undefined && (typeof stage.localeParam !== "string" || !/^[A-Za-z0-9_-]+$/.test(stage.localeParam))) throw new Error(`${CONFIG_FILE}: stage.localeParam must be a plain query parameter name`);
}
