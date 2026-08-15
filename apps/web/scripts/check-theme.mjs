/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/strict-boolean-expressions -- Node executes this small build-integrity script directly. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const themeArtifacts = ["booze.css", "booze.js", "booze.d.ts", "booze.variants.d.ts"];

export function normaliseGeneratedHeader(value) {
  return value
    .split("\n")
    .filter((line) => !line.includes(" * Command:") && !line.includes(" * Generated:"))
    .join("\n");
}

export function compareThemeArtifacts(committedDirectory, regeneratedDirectory) {
  return themeArtifacts.filter((artifact) => {
    const committedPath = path.join(committedDirectory, artifact);
    const regeneratedPath = path.join(regeneratedDirectory, artifact);
    if (!existsSync(committedPath) || !existsSync(regeneratedPath)) {
      return true;
    }
    return (
      normaliseGeneratedHeader(readFileSync(committedPath, "utf8")) !==
      normaliseGeneratedHeader(readFileSync(regeneratedPath, "utf8"))
    );
  });
}

export function checkTheme() {
  const webDirectory = path.resolve(import.meta.dirname, "..");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "booze-theme-"));
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "astryx",
        "theme",
        "build",
        "src/booze-theme.ts",
        "--out",
        path.join(temporaryDirectory, "booze.css"),
      ],
      { cwd: webDirectory, stdio: "pipe" },
    );

    return compareThemeArtifacts(path.join(webDirectory, "src/generated"), temporaryDirectory);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  const staleArtifacts = checkTheme();
  if (staleArtifacts.length > 0) {
    process.stderr.write(
      `Generated ASTRYX theme artifacts are stale: ${staleArtifacts.join(", ")}. Run \`pnpm --filter @chikachow/booze-web theme:build\`.\n`,
    );
    process.exitCode = 1;
  }
}
