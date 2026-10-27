/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `npm run dev`         -> :5173, proxies /api to the real app on :8000
// `npm run dev:sandbox` -> :5174, proxies /api to the sandbox backend on :8001 (use this for testing)
export default defineConfig(({ mode }) => {
  const sandbox = mode === "sandbox";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: sandbox ? 5174 : 5173,
      strictPort: true,
      proxy: {
        "/api": sandbox ? "http://127.0.0.1:8001" : "http://127.0.0.1:8000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
