import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = env.VITE_API_ORIGIN || "http://localhost:3008";

  return {
    plugins: [react()],
    server: {
      // PROTOTYPE branch (redesign/trending-ideas): isolated on 5180 so it never
      // contaminates the canonical web port 5175. strictPort → fail loud if taken.
      port: 5180,
      strictPort: true,
      proxy: {
        "/api": apiOrigin,
      },
    },
  };
});
