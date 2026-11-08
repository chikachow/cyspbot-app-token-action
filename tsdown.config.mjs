import { defineConfig } from "tsdown";

import { verifyBundle } from "./scripts/verify-bundle.mjs";

export default defineConfig({
  clean: false,
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
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
  plugins: [verifyBundle()],
  target: "node24",
});
