// helpers.tmp() folders are removed when the process that made them exits (2026-10-06: the
// suites had left thousands of superskill-* folders in the real temp folder).
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./helpers.mjs";

test("a tmp() folder is gone once the process that made it exits", () => {
  const helpers = pathToFileURL(join(ROOT, "test", "helpers.mjs")).href;
  const made = execFileSync(process.execPath, ["--input-type=module", "-e",
    `import { tmp, copySkill } from ${JSON.stringify(helpers)}; console.log(tmp()); console.log(copySkill("bad-name"));`],
    { encoding: "utf8" }).trim().split("\n");
  assert.equal(made.length, 2);
  for (const d of made) assert.equal(existsSync(d), false, `${d} survived its process`);
});
