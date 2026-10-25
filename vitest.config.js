//File for the test runner, how the tests run (in a fake browser, with the extra matchers loaded).

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.js on purpose, so we don't touch the dev-server
// config (proxy, etc.) and avoid merge conflicts with teammates.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.js",
  },
});