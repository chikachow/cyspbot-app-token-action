import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const bundlePath = process.argv[2] ?? "dist/index.js";
const source = readFileSync(bundlePath, "utf8");
const specifiers = new Set();

const patterns = [
  /^\s*import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["'];?/gmu,
  /^\s*export\s+[^'"]+\s+from\s+["']([^"']+)["'];?/gmu,
  /\b(?:__require|require)\(\s*["']([^"']+)["']\s*\)/gu,
];

for (const pattern of patterns) {
  for (const match of source.matchAll(pattern)) {
    specifiers.add(match[1]);
  }
}

const builtins = new Set(builtinModules.flatMap((specifier) => [specifier, `node:${specifier}`]));
const externalSpecifiers = [...specifiers]
  .filter((specifier) => !builtins.has(specifier))
  .sort((left, right) => left.localeCompare(right));

if (externalSpecifiers.length > 0) {
  console.error(
    `Expected ${bundlePath} to import only Node.js built-ins, found:\n${externalSpecifiers
      .map((specifier) => `- ${specifier}`)
      .join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`${bundlePath} imports only Node.js built-ins.`);
}
