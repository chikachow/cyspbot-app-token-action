import { defineConfig } from "tsdown";

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
  target: "node24",
});
