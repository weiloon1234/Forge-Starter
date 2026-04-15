import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
      "@locales": path.resolve(__dirname, "../../locales"),
    },
  },
  build: {
    outDir: "../../public/user",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    cors: true,
    origin: "http://localhost:5174",
  },
});
