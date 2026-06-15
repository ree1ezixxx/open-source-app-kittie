import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = env.VITE_API_ORIGIN || "http://localhost:3008";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": apiOrigin,
      },
    },
  };
});
