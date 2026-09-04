export interface PrintPage { title: string; png: Buffer; width: number; height: number }

/** A local print document: named pages keep each PDF sheet matched to its PNG's CSS dimensions. */
export function printDocument(pages: PrintPage[]): string {
  const rules = pages.map((page, index) => `@page p${index}{size:${page.width}px ${page.height}px;margin:0}`).join("");
  const body = pages.map((page, index) => `<section class="p${index}"><h1>${escapeHtml(page.title)}</h1><img src="data:image/png;base64,${page.png.toString("base64")}"></section>`).join("");
  const pageStyles = pages.map((page, index) => `.p${index}{height:${page.height}px;page:p${index};width:${page.width}px}`).join("");
  return `<!doctype html><html><head><style>${rules}*{box-sizing:border-box}body{margin:0}section{page-break-after:always;overflow:hidden;position:relative}${pageStyles}h1{font:14px Inter,system-ui,sans-serif;left:48px;margin:0;position:absolute;top:48px;z-index:1}img{display:block;height:100%;object-fit:contain;width:100%}</style></head><body>${body}</body></html>`;
}
const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
