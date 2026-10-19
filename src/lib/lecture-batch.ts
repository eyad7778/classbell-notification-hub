export type ResourceType = "pdf" | "video" | "external" | "other";

export type BatchLecture = { week: number; title: string; url: string; resourceType: ResourceType };

export function guessResourceType(rawUrl: string): ResourceType {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (/(^|\.)youtube\.com$|^youtu\.be$|(^|\.)vimeo\.com$/.test(host) || /\.(mp4|webm|mov|ogv)$/.test(path))
    return "video";
  if (path.endsWith(".pdf") || host === "drive.google.com" || host === "docs.google.com") return "pdf";
  return "external";
}

/**
 * One lecture per line. Accepted forms:
 *   https://link
 *   Title | https://link
 *   Title https://link
 * Lines without a title get "المحاضرة N". Numbers continue from startWeek.
 */
export function parseLectureLines(text: string, startWeek: number): { items: BatchLecture[]; invalid: string[] } {
  const items: BatchLecture[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/(https?:\/\/\S+)/i);
    let url: string | null = null;
    if (match) {
      try {
        url = new URL(match[1]!).toString();
      } catch {
        url = null;
      }
    }
    if (!url) {
      invalid.push(line);
      continue;
    }
    const week = startWeek + items.length;
    const title = line.replace(match![1]!, "").replace(/[|\-–:،,]+\s*$/, "").replace(/^\s*[|\-–:]+/, "").trim();
    items.push({ week, title: title || `المحاضرة ${week}`, url, resourceType: guessResourceType(url) });
  }
  return { items, invalid };
}
