import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  deps: {
    alwaysBundle: ["@actions/core"],
    onlyBundle: [
      "@actions/core",
      "@actions/exec",
      "@actions/http-client",
      "@actions/io",
      "@fastify/busboy",
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
