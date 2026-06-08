import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // This repo's own API (carries the live /sync-reviews endpoint).
      // Run it with: PORT=3008 pnpm --filter @kittie/api dev
      "/api": "http://localhost:3008",
    },
  },
});
