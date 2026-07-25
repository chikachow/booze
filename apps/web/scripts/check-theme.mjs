/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/strict-boolean-expressions -- Node executes this small build-integrity script directly. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "booze-theme-"));
const generatedPath = path.join(temporaryDirectory, "booze.css");

function normaliseGeneratedHeader(value) {
  return value
    .split("\n")
    .filter((line) => !line.includes(" * Command:") && !line.includes(" * Generated:"))
    .join("\n");
}

try {
  execFileSync(
    process.execPath,
    [
      "node_modules/@astryxdesign/cli/bin/astryx.mjs",
      "theme",
      "build",
      "src/booze-theme.ts",
      "--out",
      generatedPath,
    ],
    { stdio: "pipe" },
  );

  const committed = normaliseGeneratedHeader(
    readFileSync(new URL("../src/generated/booze.css", import.meta.url), "utf8"),
  );
  const regenerated = normaliseGeneratedHeader(readFileSync(generatedPath, "utf8"));

  if (committed !== regenerated) {
    process.stderr.write(
      "Generated ASTRYX theme is stale. Run `pnpm --filter @chikachow/booze-web theme:build`.\n",
    );
    process.exitCode = 1;
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
