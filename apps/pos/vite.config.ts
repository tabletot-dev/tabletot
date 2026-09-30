import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Deploy stamp: same id goes into the JS (__BUILD_ID__) and dist/version.json,
// so a running tab can tell when a newer deploy exists (reloadOnDeploy.ts).
const buildId = String(Date.now());
const versionFile = (): Plugin => ({
  name: "version-file",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: buildId }) });
  },
});

export default defineConfig({
  server: {
    host: "::",
    port: 8081,
  },
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
