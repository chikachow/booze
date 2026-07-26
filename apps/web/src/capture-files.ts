export const MAX_CAPTURE_FILES = 4;

export type MergeCaptureFilesResult = {
  readonly duplicateCount: number;
  readonly files: readonly File[];
  readonly rejectedCount: number;
};

function fileIdentity(file: File): string {
  return [file.name, file.size, file.type, file.lastModified].join("\u0000");
}

export function mergeCaptureFiles(
  current: readonly File[],
  selected: File | readonly File[] | null,
): MergeCaptureFilesResult {
  if (selected === null) {
    return { duplicateCount: 0, files: current, rejectedCount: 0 };
  }

  const next = [...current];
  const identities = new Set(current.map((file) => fileIdentity(file)));
  const selectedFiles: readonly File[] = selected instanceof File ? [selected] : selected;
  let duplicateCount = 0;
  let rejectedCount = 0;

  for (const file of selectedFiles) {
    const identity = fileIdentity(file);
    if (identities.has(identity)) {
      duplicateCount += 1;
      continue;
    }
    if (next.length >= MAX_CAPTURE_FILES) {
      rejectedCount += 1;
      continue;
    }
    next.push(file);
    identities.add(identity);
  }

  return { duplicateCount, files: next, rejectedCount };
}
