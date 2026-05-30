import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages project site lives under this subpath; dev runs at root.
const PAGES_BASE = "/mandala_cymatics/";

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

export default defineConfig(({ command }) => ({
  base: command === "build" ? PAGES_BASE : "/",
  build: { target: "es2020", outDir: "dist" },
  plugins: [
    cacheBust(),
    VitePWA({
      registerType: "autoUpdate", // a new deploy's SW activates + reloads on next load
      injectRegister: null, // registered manually in src/main.ts (immediate + update polling)
      includeAssets: ["pwa/apple-touch-icon-180.png", "icons/*.webp", "cb-shapes/*.svg", "cb-badge.js"],
      manifest: {
        name: "Mandala Cymatic Vibrations",
        short_name: "Mandala",
        description:
          "Procedural Tibetan mandala generator with a cymatic gong-vibration engine.",
        start_url: "./?src=pwa",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#120e1a",
        theme_color: "#120e1a",
        icons: [
          { src: "pwa/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,webmanifest}"],
        // HTML is served NETWORK-FIRST: an online load always re-fetches index.html
        // (which points at the fresh fingerprinted JS/CSS), so a new deploy shows up
        // immediately instead of waiting for the SW itself to update. This is the fix
        // for the "installed PWA pinned to a stale build" trap — the previous
        // cache-first precache of index.html could keep serving an old build for a
        // long time. navigateFallback remains the OFFLINE backstop only.
        // Disable navigateFallback (vite-plugin-pwa defaults it to "index.html").
        // It registers a NavigationRoute that serves the PRECACHED index cache-first
        // and — registering first — would shadow the NetworkFirst route below,
        // re-creating the staleness. With it off, the NetworkFirst route owns
        // navigations: fresh from network when online, served from its own runtime
        // cache when offline (after one online visit).
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 3, // flaky network → fall back to cache fast
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true, // new SW takes over without waiting for all tabs to close
        clientsClaim: true, // ...and controls the open page immediately → reload serves fresh
        // The 512px icons are the largest single files; keep the precache cap generous.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
}));
