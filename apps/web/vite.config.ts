import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/lifeos-icon.svg",
        "icons/lifeos-192.png",
        "icons/lifeos-512.png",
        "icons/lifeos-maskable-512.png",
        "icons/lifeos-apple-touch.png",
      ],
      manifest: {
        name: "Anton Life OS",
        short_name: "Life OS",
        description: "Lokale persönliche Übersicht für Kalender und Alltag.",
        lang: "de-DE",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f4f1e8",
        theme_color: "#173f39",
        icons: [
          {
            src: "/icons/lifeos-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/lifeos-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/lifeos-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    css: true,
    restoreMocks: true,
  },
});
