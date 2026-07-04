import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: [
      "@actions/core",
      "@actions/exec",
      "@actions/http-client",
      "@actions/io",
      "tunnel",
      "undici",
    ],
  },
  entry: {
    index: "src/main.ts",
  },
  format: "esm",
  outDir: "dist",
  outExtensions() {
    return {
      js: ".js",
    };
  },
  platform: "node",
  target: "node24",
});
