# Plan: End-to-End (Browser) Tests for bloom-player

_Last updated: July 2026. Companion to [REACT-MODERNIZATION-PLAN.md](REACT-MODERNIZATION-PLAN.md)
(Phase 0, safety net). Status: **implemented** — see `e2e/` and `playwright.config.ts`;
run with `pnpm test:e2e` (after `pnpm build:standalone`). Implementation notes that
differ from the original design are marked below._

## Why

The jsdom component tests (src/bloom-player-core.test.tsx) pin down the loading pipeline
and callbacks, but they cannot cover real-browser behavior: swiper's actual page-turning
(its geometry is NaN in jsdom), audio and the browser autoplay policy (BL-16146), and —
most importantly — the real built artifact. What hosts (BloomLibrary.org, Bloom Reader,
Bloom Editor preview, RAB) actually embed is `dist/bloomplayer.htm?url=<book>`; nothing
automated exercises that today.

## Where we start from (surveyed July 2026)

- **No headless browser tests exist.** No Playwright/Cypress/Puppeteer/test-runner
  anywhere; CI (`.github/workflows/release.yml`) runs only vitest, on push to
  master/alpha, and already builds `dist/` *before* the test step.
- **Storybook `play()` tests exist but only run manually.** `src/stories/`
  `playerInteraction.stories.tsx` (3 assertion-rich tests), `controlBarInteraction.stories.tsx`,
  and `navigation.stories.tsx` (multi-book navigation via the `BloomPlayerTester` page-object)
  have real assertions, but they execute only when a human opens the story in the Storybook
  UI. `BloomPlayerTester` relies on hardcoded sleeps and is known flaky, and the three
  playerInteraction tests fetch published books from S3, so they are not hermetic.
- **Hermetic fixtures are already checked in**: 11 book folders under `public/testBooks/`
  (the multibook pair, a talking book with audio, several activity/widget books, and
  multilingual books). These cover the entire initial e2e suite below; the only foreseen
  gap is a minimal motion book (deferred until we write a motion spec).

## Decisions

1. **Standalone Playwright**, driving `dist/bloomplayer.htm?url=...` directly in a real
   Chromium — the exact embedding surface hosts use. We do not wire a Storybook test runner.
   - _Alternative considered_: the Storybook vitest addon (`@storybook/addon-vitest`),
     which would execute the existing `play()` tests headlessly. Rejected for now in favor
     of purpose-built e2e tooling (traces, retries, first-class debugging) that tests the
     shipped artifact rather than stories, and avoids coupling the safety net to Storybook.
   - **The Playwright suite supersedes the storybook interaction tests.** The scenarios in
     `navigation.stories.tsx` and `playerInteraction.stories.tsx` are ported into the specs
     below (multibook, language-menu, audio, activities). Once those specs are green in CI,
     delete the `play()` functions and `BloomPlayerTester` rather than maintaining two
     copies of the same tests. Storybook itself stays — as the development environment and
     for the checks that can't be asserted automatically: visual/layout fidelity, motion and
     animation quality, RTL appearance, touch-device behavior, and the live-from-Bloom-Editor
     story.
2. **CI: release workflow only.** Add e2e steps to `release.yml` (push to master/alpha).
   No PR workflow for now. A failing e2e run blocks the release — that is the point.
3. **No S3 books checked in.** Reuse the existing `public/testBooks/` fixtures; author
   new minimal fixture books only where a feature has no local coverage.

## Design

### Dependencies and configuration

- `@playwright/test` as a devDependency, **pinned exactly** (repo convention;
  `pnpm add -D -E @playwright/test`). No other new dependencies — the static server
  uses node builtins only.
- New `playwright.config.ts`: `testDir: "./e2e"`; a single chromium project initially;
  `retries: 2` in CI (0 locally); `trace: "on-first-retry"`, `screenshot: "only-on-failure"`;
  HTML reporter in CI; `baseURL` `http://localhost:8085` (overridable via `BP_E2E_PORT`);
  `webServer: { command: "node e2e/server.mjs", reuseExistingServer: !CI }`.
- **vitest must be scoped to `src/`**: `vitest.config.ts` currently has no `include`
  pattern, so its default glob would pick up `e2e/*.spec.ts` and fail. Add
  `include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"]` in the same commit that adds the
  first spec.
- `.gitignore`: add `test-results/` and `playwright-report/`.
- npm scripts: `test:e2e` (`playwright test`), `test:e2e:ui` (`playwright test --ui`),
  `test:e2e:build` (`pnpm build:standalone && playwright test`). `pnpm test` stays
  vitest-only.

### Static server — `e2e/server.mjs`

A small checked-in script using only `node:http`/`node:fs`/`node:path` (works on Windows
dev machines and ubuntu CI):

- **Fail-fast guard**: if `dist/bloomplayer.htm` is missing, exit(1) with
  `Run "pnpm build:standalone" first`. (The vite build sets `copyPublicDir: false`, so
  testBooks are *not* in dist — hence two roots.)
- Serve from two roots in order: `dist/` first (bloomplayer.htm + hashed bundle), then
  `public/` (`/testBooks/...`).
- **`/book/<instanceId>/...` → `/testBooks/<name>/...` rewrite**, mirroring the map in
  `.storybook/main.ts` (`2e492eb1-...` → `multibook-index`, `2c1b71ac-...` →
  `multibook-target1`); unknown ids 404 gracefully. Cross-reference comments in both files
  so the maps don't drift.
- `decodeURIComponent` request paths (fixture folders contain spaces), a path-traversal
  guard, and a MIME map covering htm/js/css/json/png/jpg/svg/mp3/mp4/webm/woff2.

### Page object — `e2e/playerPage.ts`

Port `src/stories/BloomPlayerTester.ts` to Playwright locators with auto-waiting — no
fixed sleeps. Key points:

- `gotoBook(bookUrl, params)` navigates the top-level page straight to
  `/bloomplayer.htm?url=...` (no iframe gymnastics; embedding gets its own spec).
- All page-text assertions are scoped to `.swiper-slide-active` — swiper keeps
  neighboring slides in the DOM, so unscoped text queries match multiple slides.
- Locators: `.swiper-button-next/-prev button` (not `-right/-left`, which swap for RTL),
  `getByTestId("history-back-button")`, `getByTitle("Choose Language")`.

### Initial specs (~8 files under `e2e/`)

| Spec | Fixture | What it asserts |
| --- | --- | --- |
| `smoke.spec.ts` | multibook-target1 | first page renders; bundle loads; no page errors |
| `navigation.spec.ts` | multibook-target1 | prev hidden on cover; next/prev actually change page content; page-number slider updates |
| `url-params.spec.ts` | Testing Away Again | `start-page=2` lands on page 2; `hideNavButtons=true`; `showBackButton=true` initial state |
| `language-menu.spec.ts` | drag and drop games (Tetun/English) | menu lists the book's languages; switching changes the visible cover text |
| `audio.spec.ts` | sign-language-with-talking-book | narration highlight (`ui-audioCurrent`) / audio progresses after user click; with `--autoplay-policy=user-gesture-required`, the blocked-autoplay path recovers on interaction (BL-16146) |
| `multibook.spec.ts` | multibook pair | port of the `navigation.stories.tsx` flow: cross-book links via `/book/<id>#<page>`, the history back button stack, disabled at the bottom — the highest-value spec |
| `activities.spec.ts` | sample-iframe-activity / Bloom5.4-activities | navigation buttons hidden on activity pages; quiz answer click gives feedback |
| `iframe-host.spec.ts` | new tiny `e2e/fixtures/host.html` | player works embedded in an iframe the way real hosts embed it; postMessage reaches the host page |

New fixture authoring for this suite: **none**. Deferred: `public/testBooks/minimal-motion-book/`
(model on multibook-target1) when we add a motion/autoplay spec.

### CI — `.github/workflows/release.yml`

After the existing `Run tests` step:

```yaml
- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps chromium

- name: Run e2e tests
  run: pnpm run test:e2e

- name: Upload Playwright report
  if: failure()
  uses: actions/upload-artifact@v4
  with:
      name: playwright-report
      path: playwright-report/
      retention-days: 7
```

`dist/` is already built earlier in the job, so no rebuild. Defer browser-download
caching (`~/.cache/ms-playwright`) until job time becomes a problem.

## Known risks and implementation notes

- **Codecs**: Playwright's bundled Chromium lacks proprietary H.264/AAC. Keep video
  assertions to element presence / blocked-state handling; mp3 narration is fine. A
  `channel: "chrome"` project can be added later for video-decoding tests.
- **Autoplay policy** _(learned during implementation)_: chromium's new headless mode
  always allows autoplay and **ignores `--autoplay-policy` launch args**. The blocked
  path is therefore tested deterministically in `audio.spec.ts` by stubbing
  `HTMLMediaElement.play` to reject with `NotAllowedError` (exactly what a real
  browser does) until the user gesture. Independently, `PlayerPage.waitForPlayerToSettle`
  dismisses the big play-button overlay if an environment does block autoplay.
- **Back button semantics** _(learned during implementation)_: with
  `showBackButton=true` and no in-player history the button is *enabled* — clicking
  sends `backButtonClicked` to the host, which has its own history. It reads disabled
  only when neither player history nor a host is there to consume it.
- **Known fixture 404**: `multibook-index/index.htm` links `../customCollectionStyles.css`,
  which resolves above the book folder; the server 404s gracefully.
- **Startup timer**: the player's `finishUp` runs a fixed 500ms "startingUpSwiper"
  stabilization window during which swiper input is suppressed and the position is
  forced back to the start page. There is no DOM signal for its end, so
  `PlayerPage.waitForPlayerToSettle` waits it out (800ms) before every action.
  _Candidate modernization improvement_: expose a ready attribute on the player root
  so tests (and hosts) can know when the player is interactive.

## Verification (when implementing)

1. `pnpm install && pnpm exec playwright install chromium`; `pnpm build:standalone`.
2. `node e2e/server.mjs`, then spot-check in a browser:
   `http://localhost:8085/bloomplayer.htm?url=/testBooks/multibook-target1/index.htm`,
   the `/book/<id>/index.htm` rewrite, and a spaces-in-path fixture.
3. Rename `dist/` away → `pnpm test:e2e` fails fast with the actionable message; restore.
4. `pnpm test:e2e` green headless on Windows; `pnpm test` still runs only the vitest suite.
5. Push to alpha and watch the release workflow run the new steps on ubuntu.
