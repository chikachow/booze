import assert from "node:assert/strict";
import test from "node:test";

import { generatedId, stableId } from "./api/ids.ts";

await test("slug IDs can collide when long natural keys differ after the truncation boundary", () => {
  const longWineryPrefix =
    "site-home-winery-site-home-de-beaurepaire-wines-pty-ltd-central-ranges-rylstone";

  assert.equal(
    stableId("vintage", `${longWineryPrefix}-Le Chevalier-2019`),
    stableId("vintage", `${longWineryPrefix}-Leopold-2017`),
  );
});

await test("generated IDs do not derive row identity from mutable catalogue fields", () => {
  const first = generatedId("vintage");
  const second = generatedId("vintage");

  assert.match(first, /^vintage_[0-9a-f-]{36}$/u);
  assert.match(second, /^vintage_[0-9a-f-]{36}$/u);
  assert.notEqual(first, second);
});
