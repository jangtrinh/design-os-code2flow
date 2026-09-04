export interface HtmlTag {
  name: string;
  attributes: Record<string, string>;
  start: number;
  end: number;
  line: number;
  closing: boolean;
}

const tagPattern = /<\/?([a-z][\w-]*)\b([^>]*)>/gi;
const attributePattern =
  /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** Scans ordinary HTML tags without depending on a browser DOM implementation. */
export function scanHtmlTags(source: string): HtmlTag[] {
  const tags: HtmlTag[] = [];
  for (const match of source.matchAll(tagPattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    tags.push({
      name: match[1].toLowerCase(),
      attributes: parseHtmlAttributes(match[2]),
      start,
      end: start + raw.length,
      line: source.slice(0, start).split("\n").length,
      closing: raw.startsWith("</"),
    });
  }
  return tags;
}

/** Parses the attributes from one HTML start tag into lower-case keys. */
export function parseHtmlAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

/** Extracts a short, whitespace-normalized label from markup following a tag. */
export function htmlTagLabel(source: string, tag: HtmlTag): string {
  const closeTag = new RegExp(`</${tag.name}\\s*>`, "i");
  const closingIndex = source.slice(tag.end).search(closeTag);
  const raw =
    closingIndex < 0 ? "" : source.slice(tag.end, tag.end + closingIndex);
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
