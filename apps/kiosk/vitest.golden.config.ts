import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vitest.config.ts on purpose: golden-session tests hit a live
// local Supabase instance and need real env vars, so they must never be
// swept into the fast, credential-free `npm run test` suite.
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
