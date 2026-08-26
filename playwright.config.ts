import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real built player (dist/bloomplayer.htm) in a real
// browser, served together with the fixture books in public/testBooks by
// e2e/server.mjs. Run "pnpm build:standalone" first (or "pnpm test:e2e:build").
// See E2E-TESTING-PLAN.md for the overall design.

const PORT = Number(process.env.BP_E2E_PORT ?? 8085);

export default defineConfig({
    testDir: "./e2e",
    timeout: 30_000,
    // player startup (500ms stabilization timer) + swiper transitions are slow-ish
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [["list"], ["html", { open: "never" }]]
        : [["list"]],
    // Note on media autoplay: chromium's new headless mode allows it (and
    // ignores --autoplay-policy), so books with narration usually just play.
    // Where the environment does block it, the player shows its big
    // play-button overlay; PlayerPage.waitForPlayerToSettle dismisses that the
    // way a user would, and audio.spec.ts tests the blocked path
    // deterministically by stubbing HTMLMediaElement.play.
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "node e2e/server.mjs",
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 15_000,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
