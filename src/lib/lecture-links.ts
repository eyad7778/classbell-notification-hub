export type ViewerKind = "frame" | "image" | "video";

export type ContentTarget =
  { action: "preview"; url: string; kind: ViewerKind } | { action: "external"; url: string };

export function viewerKind(rawUrl: string): ViewerKind {
  const pathname = new URL(rawUrl).pathname.toLowerCase();
  if (/\.(mp4|webm|ogv|mov)$/.test(pathname)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif)$/.test(pathname)) return "image";
  return "frame";
}

export function contentTarget(rawUrl: string): ContentTarget {
  const value = rawUrl.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("رابط غير صالح");

  const host = url.hostname.toLowerCase();
  const driveId = url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id");
  if (host === "drive.google.com" && driveId && !url.pathname.includes("/folders/")) {
    return {
      action: "preview",
      url: `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
      kind: "frame",
    };
  }
  if (host === "docs.google.com" && driveId) {
    const kind = url.pathname.includes("/presentation/")
      ? "presentation"
      : url.pathname.includes("/spreadsheets/")
        ? "spreadsheet"
        : "document";
    const previewUrl =
      kind === "presentation"
        ? `https://docs.google.com/presentation/d/${encodeURIComponent(driveId)}/embed`
        : kind === "spreadsheet"
          ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(driveId)}/preview`
          : `https://docs.google.com/document/d/${encodeURIComponent(driveId)}/preview`;
    return { action: "preview", url: previewUrl, kind: "frame" };
  }
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    const videoId =
      host === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : (url.searchParams.get("v") ?? url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]);
    if (videoId) {
      return {
        action: "preview",
        url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
        kind: "frame",
      };
    }
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    if (videoId && /^\d+$/.test(videoId)) {
      return { action: "preview", url: `https://player.vimeo.com/video/${videoId}`, kind: "frame" };
    }
  }

  const kind = viewerKind(url.toString());
  if (url.protocol === "https:" && (kind !== "frame" || /\.pdf$/i.test(url.pathname))) {
    return { action: "preview", url: url.toString(), kind };
  }
  return { action: "external", url: url.toString() };
}
