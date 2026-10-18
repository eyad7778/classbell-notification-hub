import { describe, expect, it } from "vitest";
import { contentTarget } from "@/lib/lecture-links";

describe("lecture content links", () => {
  it("keeps ordinary external URLs intact and opens them externally", () => {
    const result = contentTarget("https://example.edu/watch?course=econ&token=a%2Fb");
    expect(result).toEqual({
      action: "external",
      url: "https://example.edu/watch?course=econ&token=a%2Fb",
    });
  });

  it("does not upgrade insecure external links to https", () => {
    expect(contentTarget("http://legacy.example.edu/lecture")).toEqual({
      action: "external",
      url: "http://legacy.example.edu/lecture",
    });
  });

  it("opens insecure direct PDF links externally instead of embedding blocked mixed content", () => {
    expect(contentTarget("http://legacy.example.edu/notes.pdf")).toEqual({
      action: "external",
      url: "http://legacy.example.edu/notes.pdf",
    });
  });

  it("previews supported Google Drive file links using only their file id", () => {
    expect(
      contentTarget("https://drive.google.com/file/d/drive-file-123/view?usp=sharing"),
    ).toEqual({
      action: "preview",
      url: "https://drive.google.com/file/d/drive-file-123/preview",
      kind: "frame",
    });
  });

  it("keeps Drive folder links external", () => {
    expect(contentTarget("https://drive.google.com/drive/folders/folder-123")).toEqual({
      action: "external",
      url: "https://drive.google.com/drive/folders/folder-123",
    });
  });

  it("uses native in-app previews for secure direct PDFs", () => {
    expect(contentTarget("https://cdn.example.edu/files/econ-notes.pdf?download=1")).toEqual({
      action: "preview",
      url: "https://cdn.example.edu/files/econ-notes.pdf?download=1",
      kind: "frame",
    });
  });

  it("embeds YouTube and Vimeo video links", () => {
    expect(contentTarget("https://youtu.be/video-123")).toMatchObject({
      action: "preview",
      url: "https://www.youtube-nocookie.com/embed/video-123",
    });
    expect(contentTarget("https://www.vimeo.com/12345")).toMatchObject({
      action: "preview",
      url: "https://player.vimeo.com/video/12345",
    });
  });
});
