import { createHash } from "node:crypto";

/**
 * Screenshot files are named by a hash of the screen id, never by array position: a re-`scan` that
 * inserts one route must not silently pair every later screen with its neighbour's image.
 */
export function shotFileKey(screenId: string): string {
  return createHash("sha1").update(screenId).digest("hex").slice(0, 16);
}

export function shotFiles(shotsDir: string, screenId: string): { full: string; dialog: string } {
  const k = shotFileKey(screenId);
  return { full: `${shotsDir}/${k}.jpg`, dialog: `${shotsDir}/${k}-dialog.jpg` };
}
