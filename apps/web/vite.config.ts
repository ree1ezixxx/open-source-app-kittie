import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = env.VITE_API_ORIGIN || "http://localhost:3008";

  return {
    plugins: [react()],
    server: {
      // Canonical dev port is ALWAYS 5175 (strictPort:false → vite only falls back to the
      // next free port if 5175 is genuinely occupied — i.e. an error/conflict, never by choice).
      port: 5175,
      strictPort: false,
      proxy: {
        "/api": apiOrigin,
      },
    },
  };
});
