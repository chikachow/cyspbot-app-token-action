import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-release-artifact.sh", import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "release-artifact-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "--quiet");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(directory, "dist"));
  const write = (bundle = "one", action = "node24") => {
    writeFileSync(join(directory, "dist/index.js"), bundle);
    writeFileSync(join(directory, "action.yml"), action);
  };
  const tag = (version) => {
    git("add", "-f", "dist/index.js", "action.yml");
    git("-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "fixture");
    git("tag", version);
  };
  const check = (version) =>
    spawnSync("bash", [script], {
      cwd: directory,
      env: { ...process.env, VERSION: version },
      encoding: "utf8",
    });
  write();
  return { write, tag, check, git };
}

test("first release is allowed without a predecessor", (t) => {
  const { check } = fixture(t);
  assert.equal(check("v0.0.1").status, 0);
  assert.equal(check("v0.0.1-rc.1").status, 0);
});

test("direct preparation rejects identical artifacts without a comparison input", (t) => {
  const { tag, check } = fixture(t);
  tag("v1.0.0");
  const result = check("v1.0.1");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No action artifact changes detected since v1.0.0/);
});

test("either published artifact may change", (t) => {
  const { tag, write, check } = fixture(t);
  tag("v1.0.0");
  write("two");
  assert.equal(check("v1.0.1").status, 0);
  write("one", "node26");
  assert.equal(check("v1.0.1").status, 0);
});

test("RCs use their latest numeric predecessor, stable promotion uses stable", (t) => {
  const { tag, write, check } = fixture(t);
  tag("v1.0.0");
  write("rc2");
  tag("v1.0.1-rc.2");
  write("rc10");
  tag("v1.0.1-rc.10");
  assert.equal(check("v1.0.1-rc.11").status, 1);
  assert.equal(check("v1.0.1").status, 0);
  write("rc11");
  assert.equal(check("v1.0.1-rc.11").status, 0);
});

test("a new RC line falls back to stable and ignores other RC lines", (t) => {
  const { tag, write, check } = fixture(t);
  tag("v1.0.0");
  write("other line");
  tag("v1.1.0-rc.1");
  write();
  assert.equal(check("v1.0.1-rc.1").status, 1);
});

test("missing predecessor artifacts fail closed", (t) => {
  const { git, check } = fixture(t);
  git("add", "action.yml");
  git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "incomplete");
  git("tag", "v1.0.0");
  assert.notEqual(check("v1.0.1").status, 0);
});
