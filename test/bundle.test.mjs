import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "tsdown";

import config from "../tsdown.config.mjs";

const shim =
  'import { createRequire } from "node:module"; const __require = (() => createRequire(import.meta.url))();';

// Replace the emitted chunk, so fixtures exercise final output, not source transforms.
const cases = [
  [
    "built-ins",
    `${shim} import "node:fs"; export { isIP } from "net"; await import("node:test"); require("fs"); __require("node:path");`,
    true,
  ],
  ["comments and strings", `// require("external")\nconst text = 'import("external")';`, true],
  ["static external", 'import "missing-package";', false],
  ["same-line external", 'import "node:fs"; import "missing-package";', false],
  ["dynamic external", 'await import("missing-package");', false],
  ["relative import", 'import "./missing.js";', false],
  ["re-export", 'export * from "missing-package";', false],
  ["named re-export", 'export { x } from "missing-package";', false],
  ["require", 'require("missing-package");', false],
  ["emitted require", `${shim} __require("missing-package");`, false],
  ["computed import", "await import(moduleName);", false],
  ["computed require", `${shim} __require(moduleName);`, false],
  ["unknown node module", 'import "node:not-a-builtin";', false],
];

for (const [name, code, accepted] of cases) {
  test(`bundle verification: ${name}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "action-bundle-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const entry = join(directory, "entry.js");
    await writeFile(entry, "export const fixture = true;");
    const run = () =>
      build({
        ...config,
        config: false,
        entry: { index: entry },
        outDir: join(directory, "dist"),
        logLevel: "silent",
        plugins: [
          {
            name: "fixture-output",
            generateBundle: {
              order: "pre",
              handler(_options, bundle) {
                Object.values(bundle)[0].code = code;
              },
            },
          },
          ...config.plugins,
        ],
      });
    if (accepted) {
      await run();
    } else {
      await assert.rejects(run, /only load literal Node built-in modules/);
    }
  });
}

// Real source fixtures exercise helper renaming and inlining by the bundler.
for (const [name, source, accepted] of [
  [
    "renamed helper",
    'export const __require = "label"; export function load(name) { return require(name); }',
    false,
  ],
  [
    "inlined alias",
    "const load = require; export function run(name) { return load(name); }",
    false,
  ],
  [
    "factory loader",
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); export function run(name) { return load(name); }',
    false,
  ],
  ["indirect call", "export function run(name) { return require.call(null, name); }", false],
  ["escaping loader", "export const load = require;", false],
  [
    "immediate factory call",
    'import { createRequire } from "node:module"; export function run(name) { return createRequire(import.meta.url)(name); }',
    false,
  ],
  [
    "dynamic module namespace",
    'const { createRequire } = await import("node:module"); const load = createRequire(import.meta.url); export function run(name) { return load(name); }',
    false,
  ],
  [
    "required module namespace",
    'export const fs = require("node:fs"); const mod = require("node:module"); const load = mod.createRequire(import.meta.url); export function run(name) { return load(name); }',
    false,
  ],
  [
    "internal module loader",
    'import { _load } from "node:module"; export function run(name) { return _load(name); }',
    false,
  ],
  [
    "literal factory loader",
    'import { createRequire as factory } from "node:module"; const load = factory(import.meta.url); export const fs = load("node:fs");',
    true,
  ],
]) {
  test(`bundled source: ${name}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "action-source-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const entry = join(directory, "entry.js");
    await writeFile(entry, source);
    const run = () =>
      build({
        ...config,
        config: false,
        entry: { index: entry },
        outDir: join(directory, "dist"),
        logLevel: "silent",
      });
    if (accepted) await run();
    else
      await assert.rejects(
        run,
        /only load literal Node built-in modules|Unsupported module loader use/,
      );
  });
}
