/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call -- Astryx CLI consumes this typed theme source and emits checked runtime artifacts. */
import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export const boozeTheme = defineTheme({
  name: "booze",
  extends: neutralTheme,
  color: {
    accent: "#7c2742",
    contrast: "standard",
    neutralStyle: "warm",
  },
  tokens: {
    "--color-text-secondary": ["#564146", "#C6ADB2"],
  },
  radius: {
    base: 4,
    multiplier: 1,
  },
});
