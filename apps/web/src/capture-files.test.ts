import { describe, expect, it } from "vitest";

import { MAX_CAPTURE_FILES, mergeCaptureFiles } from "./capture-files.ts";

function photo(name: string, lastModified = 1): File {
  return new File([name], name, { lastModified, type: "image/jpeg" });
}

describe("mergeCaptureFiles", () => {
  it("accumulates files from sequential selections", () => {
    const first = photo("front.jpg");
    const second = photo("back.jpg");

    const firstMerge = mergeCaptureFiles([], first);
    expect(mergeCaptureFiles(firstMerge.files, second)).toEqual({
      duplicateCount: 0,
      files: [first, second],
      rejectedCount: 0,
    });
  });

  it("deduplicates the same file identity", () => {
    const first = photo("front.jpg");
    const duplicate = photo("front.jpg");

    expect(mergeCaptureFiles([first], duplicate)).toEqual({
      duplicateCount: 1,
      files: [first],
      rejectedCount: 0,
    });
  });

  it("caps the accumulated list at four files", () => {
    const files = Array.from({ length: MAX_CAPTURE_FILES + 2 }, (_, index) =>
      photo(`${index}.jpg`),
    );

    expect(mergeCaptureFiles([], files)).toEqual({
      duplicateCount: 0,
      files: files.slice(0, MAX_CAPTURE_FILES),
      rejectedCount: 2,
    });
  });

  it("does not clear existing files when the picker reports null", () => {
    const first = photo("front.jpg");

    expect(mergeCaptureFiles([first], null)).toEqual({
      duplicateCount: 0,
      files: [first],
      rejectedCount: 0,
    });
  });

  it("does not report duplicates as cap rejections", () => {
    const existing = Array.from({ length: MAX_CAPTURE_FILES }, (_, index) => photo(`${index}.jpg`));

    expect(mergeCaptureFiles(existing, [photo("0.jpg"), photo("extra.jpg")])).toEqual({
      duplicateCount: 1,
      files: existing,
      rejectedCount: 1,
    });
  });
});
