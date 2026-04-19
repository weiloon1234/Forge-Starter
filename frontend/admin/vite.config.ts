import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/admin/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
      "@locales": path.resolve(__dirname, "../../locales"),
    },
  },
  build: {
    outDir: "../../public/admin",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    cors: true,
    origin: "http://localhost:5173",
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/_forge": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
