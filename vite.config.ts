import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Plugin } from "vite";

// Bump the cache-busting token on every production build (dev keeps the last
// token stable). Recipe from the cache-busting skill's Vite integration.
function cacheBust(): Plugin {
  return {
    name: "cb-bust",
    apply: "build",
    buildStart() {
      if (existsSync("./scripts/bust.sh")) {
        execSync("./scripts/bust.sh --quiet", { stdio: "inherit" });
      }
    },
  };
}

export default {
  base: "./",
  plugins: [cacheBust()],
  build: {
    target: "es2020",
    outDir: "dist",
  },
};
