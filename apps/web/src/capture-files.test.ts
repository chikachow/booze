import { describe, expect, it } from "vitest";

import { MAX_CAPTURE_FILES, mergeCaptureFiles } from "./capture-files.ts";

function photo(name: string, lastModified = 1): File {
  return new File([name], name, { lastModified, type: "image/jpeg" });
}

describe("mergeCaptureFiles", () => {
  it("accumulates files from sequential selections", () => {
    const first = photo("front.jpg");
    const second = photo("back.jpg");

    expect(mergeCaptureFiles(mergeCaptureFiles([], first), second)).toEqual([first, second]);
  });

  it("deduplicates the same file identity", () => {
    const first = photo("front.jpg");
    const duplicate = photo("front.jpg");

    expect(mergeCaptureFiles([first], duplicate)).toEqual([first]);
  });

  it("caps the accumulated list at four files", () => {
    const files = Array.from({ length: MAX_CAPTURE_FILES + 2 }, (_, index) =>
      photo(`${index}.jpg`),
    );

    expect(mergeCaptureFiles([], files)).toEqual(files.slice(0, MAX_CAPTURE_FILES));
  });

  it("does not clear existing files when the picker reports null", () => {
    const first = photo("front.jpg");

    expect(mergeCaptureFiles([first], null)).toEqual([first]);
  });
});
