export const MAX_CAPTURE_FILES = 4;

function fileIdentity(file: File): string {
  return [file.name, file.size, file.type, file.lastModified].join("\u0000");
}

export function mergeCaptureFiles(
  current: readonly File[],
  selected: File | readonly File[] | null,
): readonly File[] {
  if (selected === null) {
    return current;
  }

  const next = [...current];
  const identities = new Set(current.map((file) => fileIdentity(file)));
  const selectedFiles: readonly File[] = selected instanceof File ? [selected] : selected;

  for (const file of selectedFiles) {
    const identity = fileIdentity(file);
    if (!identities.has(identity)) {
      next.push(file);
      identities.add(identity);
    }
    if (next.length === MAX_CAPTURE_FILES) {
      break;
    }
  }

  return next;
}
