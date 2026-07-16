import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // don't try to run the Playwright specs in e2e/
        exclude: [...configDefaults.exclude, "e2e/**"],
        environment: "jsdom",
        globals: true, // don't have to define expect() and friends
        setupFiles: ["src/test/setupTests.ts"],
        // Some bloom-player-core component tests legitimately take >5s (they
        // wait out the player's 500ms startup timer and several waitFor(3000)
        // polls), so the 5s default is too tight on a busy machine.
        testTimeout: 15000,
    },
});
