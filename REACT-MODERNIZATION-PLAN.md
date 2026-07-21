# Plan: Migrating bloom-player-core to Modern React

_Last updated: July 2026_

## Why

`BloomPlayerCore` ([src/bloom-player-core.tsx](src/bloom-player-core.tsx)) is the last
large class component in the codebase (~2,800 lines). Everything around it
(`BloomPlayerControls`, `ControlBar`, `LanguageMenu`, etc.) is already written as
function components with hooks. The class is where several kinds of accumulated debt
meet:

-   **Legacy lifecycle patterns.** A ~300-line `componentDidUpdate` does book loading,
    URL parsing, and DOM manipulation; `componentDidMount` ends by manually calling
    `this.componentDidUpdate(this.props, this.state)` — a trick that works but that
    nobody fully trusts (see the March 2020 comment at the call site).
-   **Anti-patterns that block React upgrades.** The constructor mutates `this.state`
    directly and copies props into state; `render()` has a side effect
    (`setIncludeImageDescriptions`); mutable statics (`currentPagePlayer`,
    `currentPage`, `currentPageIndex`) are used as a communication channel with
    non-React modules (`narration.ts`, `music.ts`, `video.ts`, `page-api.ts`).
-   **Stuck dependencies.** React 17, Material-UI v4 (two major versions behind, no
    official React 18 support), and `react-id-swiper` 2.3.2 wrapping Swiper 4 — the
    wrapper is abandoned, and the code contains known kluges (RTL handling in
    `render()`) with comments saying "when we upgrade, we really want to switch to the
    React support that is now provided by the core Swiper component."

The goal is a function component on a current React, with current dependencies, and
with the book-loading and media logic factored so it can be reasoned about and tested.

## Goals and non-goals

**Goals**

1. `BloomPlayerCore` becomes a function component using hooks.
2. React 17 → 18 (with a follow-on evaluation of 19).
3. Material-UI v4 → MUI v5+.
4. `react-id-swiper` + Swiper 4 → official `swiper/react` (current Swiper).
5. No behavior changes visible to users or to hosts (BloomLibrary, Bloom Editor
   preview, Bloom Reader, RAB). Every phase ships independently and leaves the player
   working.

**Non-goals**

-   Rewriting the activity system, narration engine, or analytics.
-   Changing the public embedding API (URL params, postMessage protocol).
-   Adopting a state-management library. Plain hooks are sufficient here.

## Guiding principles

-   **Small, releasable phases.** Each phase below is one or a few PRs, each of which
    passes tests and manual smoke checks. No long-lived migration branch.
-   **Refactor inside the class first, convert last.** Converting a 2,800-line class in
    one step is where these migrations die. Shrink the class until the conversion is
    mechanical.
-   **One risky dependency per phase.** Swiper, MUI, and React each get their own
    phase so regressions are attributable.
-   **Characterize before changing.** The trickiest logic (book loading, swiper
    startup, autoplay, forced-pause) is timing-sensitive. We invest in a safety net
    first.

---

## Phase 0 — Safety net

The existing vitest suite covers utility modules (`navigation`, `bookInfo`,
`narration`, `video`, …) but nothing renders `BloomPlayerCore`. Before touching it:

1. **Inventory the observable behavior.** Write down (in a test plan doc or as
   storybook stories) the scenarios that must keep working:
    - load a book by folder URL and by full `.htm` URL (including `%2f`-encoded paths);
    - multi-book navigation via internal links, Back button history, `#pageId` hashes;
    - `startPageIndex`, `autoplay` (with `autoplayCount`), forced-pause recovery
      (BL-8864), pause/play from the control bar;
    - language switching (`activeLanguageCode`) updating visibility and overlay
      positions;
    - RTL books (page order reversal);
    - activities (swiping disabled/absorbed), legacy quiz pages;
    - landscape/portrait switching, `useOriginalPageSize`;
    - error paths: load failure, `requiredVersion` message, "/working" spinner in
      Bloom Editor preview.
2. **Add component-level smoke tests** with vitest + Testing Library + a mocked
   `axios` (or `msw`): render the player with a small fixture book, assert pages
   render, page turning fires `pageChanged`, and load-failure shows the error UI.
   These tests are the tripwire for every later phase.
   _Status: done — see `src/bloom-player-core.test.tsx` (12 tests)._
3. **Add end-to-end browser tests** exercising the real built `dist/bloomplayer.htm`
   in headless Chromium — real swiper page turns, audio/autoplay policy, multi-book
   history, host embedding. Designed in [E2E-TESTING-PLAN.md](E2E-TESTING-PLAN.md)
   (standalone Playwright, hermetic `public/testBooks/` fixtures, run in the release
   workflow). _Status: done — see `e2e/` (12 tests, `pnpm test:e2e`)._ These
   supersede the manually-run storybook `play()` interaction tests, which get
   deleted once the equivalent specs prove themselves in CI.
4. **Keep storybook for what can't be asserted automatically.** After (2) and (3),
   the manual storybook walk shrinks to visual/layout fidelity, motion and animation
   quality, RTL appearance, touch-device behavior, and the live-from-Bloom-Editor
   story. Make sure stories exist for those, so manual verification is a walk through
   storybook, not an ad-hoc hunt for books.

Deliverable: a checklist we re-run at the end of every phase.

_Status note (July 2026): Phases 1–2 are implemented and merged down the stacked
branches `phase1-shrink-core` → `phase2-remove-statics`. Phase 3 (the dependency
upgrades) has a first implementation on the stacked branches `phase3a-mui` →
`phase3b-swiper`: Phase 3a (MUI v5) and Phase 3b (Swiper 11) are both done. See
[MODERNIZATION-REVIEW-NOTES.md](MODERNIZATION-REVIEW-NOTES.md) for the judgment calls
and the remaining manual verification items._

## Phase 1 — Shrink the class in place (no behavior change)

_Status: partially done (PR #433). Extraction items (1) and (2) landed; the class is
smaller but the line-count exit criterion is not yet met — see below._

Pull logic out of the class into plain, testable modules while it is still a class.
This is low-risk and can be several small PRs:

1. **Extract book loading.** _Done._ The body of `componentDidUpdate` that computes
   `sourceUrl`/`urlPrefix`, fetches `index.htm` + `meta.json` + `.distribution`, and
   parses the document became `loadBook(url, urlPrefix)` in the new
   [src/bookLoader.ts](src/bookLoader.ts), alongside the URL helpers it needs
   (`computeBookUrlParts`, `fullUrl`, `getBodyAttributes`, `fixRelativeUrls`). The
   class keeps only the state updates (`bloom-player-core.tsx` now calls `loadBook`
   at its former `componentDidUpdate` site). Unit tests: [src/bookLoader.test.ts](src/bookLoader.test.ts).
2. **Extract pure helpers.** _Done._ Page-size helpers moved to
   [src/pageSizing.ts](src/pageSizing.ts) (`getPageSizeClass`/`setPageSizeClass`),
   and the language-visibility logic (`showOrHideL1OnlyText`,
   `updateDivVisibilityByLangCode`, `updateOverlayPositionsByLangCode`) to
   [src/langVisibility.ts](src/langVisibility.ts). `bloom-player-controls.tsx` now
   imports `getPageSizeClass` from the module instead of reaching into
   `BloomPlayerCore`. Unit tests: [src/pageSizing.test.ts](src/pageSizing.test.ts).
3. **Untangle `finishUp()`.** _Not yet done._ Split the "new book" work
   (language/feature reporting, analytics setup) from the "every load" work, and
   document what the trailing timeout that clears `startingUpSwiper` is actually
   waiting for. We don't need to fix it yet — just isolate it, because it will become
   an effect later.
4. **Consolidate derived flags.** _Not yet done._ `startingUpSwiper` vs
   `state.isFinishUpForNewBookComplete` overlap (the code comment already suspects a
   bug where the latter isn't reset on a new URL). Decide on one source of truth now,
   while the class semantics are familiar.

Exit criteria: `bloom-player-core.tsx` well under ~1,500 lines; `componentDidUpdate`
reads as "detect what changed, call named functions, setState". _Not met yet: the
file is ~2,400 lines after the extractions above. Items (3) and (4), plus further
extraction of the `componentDidUpdate` reaction logic, remain before Phase 1 closes._

## Phase 2 — Remove the static back-channels

_Status: done (PR #437). See [src/currentPlayer.ts](src/currentPlayer.ts)._

`narration.ts`, `music.ts`, `video.ts`, and `page-api.ts` reached back into the player
through mutable statics (`BloomPlayerCore.currentPagePlayer`,
`getCurrentPage()`, `storeVideoAnalytics(...)`, `storeAudioAnalytics(...)`). These
made a function-component conversion hazardous (statics assume exactly one live
player and survive unmount).

1. _Done._ Defined the `ICurrentPlayer` interface in
   [src/currentPlayer.ts](src/currentPlayer.ts) with `getCurrentPage()` and
   `storeVideoAnalytics(duration)`. (Audio analytics stayed a callback:
   `storeAudioAnalytics` is registered via `listenForPlayDuration` in
   `componentDidMount` rather than added to the interface — it never needed to reach
   *back* into the player, so the callback seam was the smaller change.)
2. _Done._ The player registers itself on mount (`registerCurrentPlayer(this)`) and
   **unregisters on unmount** (`unregisterCurrentPlayer(this)` in
   `componentWillUnmount`) with the module-level registry. `video.ts` and
   `page-api.ts` now call `getCurrentPlayer()?...` instead of the statics. Same
   last-registered-wins runtime shape, plus a dev-only `console.warn` on
   double-register (the risk-register mitigation) and no more reaching a dead player.
3. _Done._ `currentPage`/`currentPageIndex`/`currentPageHasVideo` are instance state,
   reached through the interface (or, for index/hasVideo, no longer needed as a
   cross-module channel).

This phase also fixed a latent bug class: listeners added in `componentDidMount` with
anonymous arrow functions (`focus`, `blur`, `keydown`, `pointerdown`, `dragstart`)
were never removed in `componentWillUnmount`. _Done_ — the handlers are now stored and
removed on unmount.

Regression coverage added with this phase: [src/bloom-player-core.test.tsx](src/bloom-player-core.test.tsx)
asserts the player registers on mount and unregisters on unmount; the analytics
suites ([src/analytics.test.tsx](src/analytics.test.tsx),
[src/analyticsChannels.test.ts](src/analyticsChannels.test.ts)) exercise both
reporting channels through the new registry/callback seams.

## Phase 3 — Dependency upgrades that unblock React 18

Phase 3 is the "one risky dependency per phase" work, split into two independent
upgrades — MUI (3a) and Swiper (3b) — each its own commit/PR with the Phase 0
checklist run against it. Do both **while still on React 17 and still a class**, so
each upgrade is isolated and (for Swiper) comparable old/new side by side in storybook.

### Phase 3a — Material-UI v4 → MUI v5

**Material-UI v4 → MUI v5** (`@material-ui/core` → `@mui/material` + `@emotion/*`).
MUI v5 supports React 17, so this doesn't force the React upgrade. `BloomPlayerCore`
itself only uses `CircularProgress` and an icon; the bulk of the work is in the
already-functional controls components. Use the official codemods; audit
theme/`makeStyles` usage across the app.

_Status: done (5.18.0) — see review notes items 9–13._

### Phase 3b — Swiper 4 → Swiper 11

**Swiper: `react-id-swiper` 2.3.2 + swiper 4 → `swiper/react` (Swiper 11+).** This is
the highest-behavior-risk upgrade in the whole plan. Specific items:

-   replace the `getSwiper` callback and `SwiperInstance` typing with `onSwiper`;
-   replace the RTL kluges in `render()` (`el.setAttribute("dir","rtl")`,
    `swiper.rtl = true`, `rtlTranslate = true`) with Swiper's supported `dir="rtl"`;
-   re-verify `simulateTouch`, `touchStartPreventDefault: false` (niceScroll depends on
    it), lazy-loading of slides, `keyboard` handling, and the `preserveDOMState`
    slide-caching behavior;
-   re-verify the pointerdown capture hack that stops swiper drags on links/videos
    (BL-14599) still works with the new event system.

**TypeScript/types housekeeping** (rides along with this phase): `@types/react` 17 →
matching versions staged with the React upgrade in Phase 5.

_Status: done (Swiper 11 via `swiper/react`) — see review notes items 14–21._

## Phase 4 — Convert `BloomPlayerCore` to a function component

With the class now small and decoupled, do the mechanical conversion, still on
React 17 (hooks semantics are identical on 17 and 18, so this decouples "conversion
bugs" from "React 18 bugs").

Mapping guide:

| Today (class) | After (hooks) |
| --- | --- |
| `IPlayerState` via `this.setState` | `useReducer` for the load-lifecycle cluster (`isLoading`, `loadFailed`, `loadErrorHtml`, `bookUrl`, `pages`, `styleRules`, …) so multi-field transitions stay atomic; `useState` for independent bits (`currentSwiperIndex`, `inPauseForced`) |
| ~30 instance fields (`sourceUrl`, `urlPrefix`, `metaDataObject`, `swiperInstance`, `startingUpSwiper`, `animation`/`music`/`video`, …) | `useRef` (they exist precisely because changing them must not re-render) |
| Constructor URL parsing / props-to-state copying | `useState(() => initialStateFromUrl(props.url, props.startPageIndex))` lazy initializer |
| `componentDidMount` document/window listeners | one `useEffect(..., [])` per concern, each returning a real cleanup |
| `componentDidUpdate` book-load trigger | `useEffect` keyed on the *preprocessed* URL, calling Phase 1's `loadBook()`; guard against races with an ignore-stale-result flag |
| `componentDidUpdate` reactions (paused, activeLanguageCode, landscape, currentSwiperIndex) | separate `useEffect`s, one dependency cluster each — this is where the 300-line method actually decomposes |
| `componentWillUnmount` | the cleanups above + a top-level unmount effect for `unsubscribeAllEvents`/`pauseAllMultimedia` |
| Public methods used via ref (`slideNext`, `slidePrevious`, `CanGoBack`, `HandleBackButtonClickedIfHavePlayerHistory`, `getBookInstanceId`, `getRootDiv`) | `forwardRef` + `useImperativeHandle`. `bloom-player-controls.tsx` already anticipates this (see the `LegacyRef` comment at the `<BloomPlayerCore ref=...>` site) |
| Side effect in `render()` (`setIncludeImageDescriptions`) | move into an effect (or compute where consumed) |

Practical notes:

-   Convert in one PR but **commit-by-commit**: first `forwardRef` shell delegating to
    the old class internals is *not* practical here — instead extract candidate
    custom hooks in-place (`useBookLoader`, `useMultimediaPauseState`,
    `usePageNavigation`, `useSwiperSetup`) and keep each under review-able size.
-   Watch for stale-closure bugs in the many event handlers that read current
    page/index state; prefer refs for values read inside DOM-level listeners.
-   The manual `componentDidUpdate(props, state)` call in `componentDidMount`
    disappears naturally: effects run on mount.

Exit criteria: no `extends React.Component` anywhere in `src/`; Phase 0 checklist
passes; no new `eslint-plugin-react-hooks` violations (add the plugin in this phase
if not already enabled, and treat `exhaustive-deps` warnings as review items, not
noise).

## Phase 5 — React 18

1. Bump `react`, `react-dom`, `@types/react*` to 18.
2. Replace `ReactDOM.render` in `bloom-player-controls.tsx` (~line 1134) with
   `createRoot`. Search for any other legacy-root usage (storybook decorators,
   tests).
3. **Automatic batching audit.** React 18 batches state updates inside promises,
   timeouts, and native event handlers. The player leans on `setTimeout` and axios
   `.then` chains around swiper startup (`finishUp`, `startingUpSwiper`,
   `addScrollbarsToPageWhenReady`); verify none of them depended on an intermediate
   render between two `setState` calls.
4. **StrictMode**: turn it on in dev/storybook only after the app is stable on 18.
   Double-invoked effects will stress-test the mount/cleanup pairs from Phase 4
   (duplicate axios loads, double swiper init, double analytics reports are the
   likely findings). Fix what it flags; this is the payoff of doing cleanup properly.
5. Re-run the full Phase 0 checklist in all hosts: storybook, BloomLibrary embed,
   Bloom Editor preview (the `/working` polling path), and a BloomPUB in Bloom
   Reader/RAB if feasible.

## Phase 6 (optional follow-on) — React 19 and polish

Evaluate after Phase 5 has been in production for a release cycle:

-   React 19: `forwardRef` no longer needed (ref as prop), `useEffect` timing
    changes are minimal at this point; main cost is another types bump and MUI
    version check.
-   Consider replacing the `controlsCallback`/`pageNumberSetter` callback plumbing
    between core and controls with context or lifted state, now that both sides are
    function components.
-   Delete `IPlayerState` remnants, dead comments about class-era workarounds, and
    the `ignorePhonyClick` state if pointer-events cleanup makes it obsolete.

## Risk register

| Risk | Phase | Mitigation |
| --- | --- | --- |
| Swiper 4 → 11 behavior drift (drag thresholds, RTL, lazy slides, DOM structure that page CSS targets) | 3b | Own PR; side-by-side storybook comparison; RTL and activity books in the checklist |
| Book-load race conditions surfacing when `componentDidUpdate` becomes effects | 4 | Stale-result guards in `useBookLoader`; smoke test that rapidly switches `url` prop |
| Statics assumed a singleton player; hosts that remount the player may behave differently once registration/unregistration is real | 2 | Keep registry semantics identical (last-registered wins); log a dev warning on double-register |
| MUI v5 visual regressions in controls (theme defaults changed between v4 and v5) | 3a | Screenshot comparison of control bar, menus, spinner in storybook |
| React 18 batching changes swiper-startup timing | 5 | Targeted manual testing of first-page audio/animation start, `autoplay`, and `startPage` handling |
| Untracked consumers of `BloomPlayerCore` statics outside this repo | 2 | The npm package's public surface is `bloom-player-controls`/embed API; note the removal in CHANGELOG anyway |

## Suggested order of work

Phases 0 → 1 → 2 can proceed immediately and are safe alongside normal feature work.
Phases 3a and 3b (MUI, then Swiper) should each land in a quiet week with time to
observe. Phase 4 is the largest single review and should happen when no big feature
branch is in flight against `bloom-player-core.tsx`. Phase 5 is small once 0–4 are
done. Nothing in this plan requires a code freeze longer than the individual PR.
