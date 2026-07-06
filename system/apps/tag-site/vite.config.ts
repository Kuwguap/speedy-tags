import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, `vercel dev` serves the /api functions; if you run plain `vite`,
// point the proxy at your local functions host (or use vercel dev).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
