# Review notes: modernization Phases 1–3 (July 2026)

Working notes on every judgment call made while executing Phases 1–3 of
[REACT-MODERNIZATION-PLAN.md](REACT-MODERNIZATION-PLAN.md) autonomously. Each phase is
a branch stacked on the previous one:

| Branch | Commit | Verified |
| --- | --- | --- |
| `phase1-shrink-core` | `7b0019a` extraction refactor | 117 unit + 12 e2e |
| `phase2-remove-statics` | `64ff088` registry + listener cleanup | 117 unit + 12 e2e |
| `phase3a-mui` | MUI v5 upgrade | 117 unit + 12 e2e |
| `phase3b-swiper` | Swiper 11 upgrade | 117 unit + 12 e2e |

Phase 3 (the dependency upgrades) is split into two stacked branches, `phase3a-mui`
and `phase3b-swiper`, each documented below.

All verification = full vitest suite + full Playwright e2e suite against a fresh
`dist/` build. **Not** done: storybook visual review, real-device/touch testing,
Bloom Editor preview integration testing.

## Process decisions

1. **Stacked branches, not siblings.** Each phase builds on the previous, so the
   branches chain. Merging means merging in order (or just merging the top branch,
   which contains everything below it).
2. **Commit types**: refactors and dependency upgrades are `chore:`, behavior-affecting
   cleanups are `fix:`. Note semantic-release will NOT cut a release for the `chore:`
   commits on their own — the modernization work ships with whatever `fix:`/`feat:`
   lands next. If you want the upgrades to drive a release themselves, reword on merge.

## Phase 1 (extraction) — judgment calls

3. **Deferred two plan items**: "untangle finishUp" and "consolidate
   startingUpSwiper/isFinishUpForNewBookComplete". Both are high-churn and are more
   naturally done during the Phase 4 hooks conversion; extracting them now would have
   meant designing a seam twice.
4. **Deleted dead code**: `isDivInL2`/`isDivInL3` had no callers.
5. `getAllBloomCanvasElements` (moved into langVisibility.ts) searches the whole book
   document even though its old name said "OnPage" — preexisting behavior, preserved,
   but the name now matches what it does.

## Phase 2 (statics → registry) — judgment calls

6. **Registry semantics are last-registered-wins with a console.warn** on
   double-register. Same runtime behavior as the old static in the normal case.
7. `getCurrentPage()` now returns `HTMLElement | null` instead of a non-null-asserted
   `HTMLElement`. The one caller (page-api.ts) already handled the falsy case.
8. The capture-phase `pointerdown`/`dragstart` listeners are now **actually removed on
   unmount** (they never were before), as are focus/blur/keydown. If any host relied on
   a zombie player still intercepting pointerdown (surely not), that changes.

## Phase 3a (MUI v5) — review these visually

9. **Chose MUI v5 (5.18.0)**, the plan's literal target, not v6/v7 — smallest step
   that unblocks React 18. A later bump is its own project.
10. **Page-number slider value label**: the v4 `withStyles` had positional hacks
    (`left: calc(50% - 16px)`, `top: -31`) compensating for v4 thumb internals. v5's
    redesigned value label centers itself, so I dropped them and kept only the
    red-background/white-text styling. **Check the page slider bubble visually.**
11. **RTL controls**: v4 used JSS; `createTheme({direction:"rtl"})` alone may not flip
    emotion-generated styles in v5 (full RTL flipping normally wants
    `stylis-plugin-rtl` + CacheProvider). The page-number slider in RTL books is the
    thing to check; the e2e suite has no RTL control-bar test.
12. Removed the `.MuiIconButton-label` less rule (v5 has no label wrapper span); the
    big play button's svg sizing comes from the existing `svg` rule. **Check the
    blocked-autoplay big play button appearance.**
13. Build emits benign rollup warnings about MUI's `"use client"` directives.

## Phase 3b (Swiper 11) — review these carefully

14. **Navigation button base CSS**: our custom buttons had silently depended on
    Swiper 4's bundled `.swiper-button-*` styles (position:absolute, width, z-index,
    cursor). Swiper 11 doesn't ship them, so bloom-player-ui.less now declares those
    four properties itself. e2e proves buttons are clickable and positioned in the
    default layout; **check `smallOutsideButtons`/`largeOutsideButtons` variants
    (BloomLibrary) visually.**
15. **Lazy background images**: Swiper 11 has no lazy module. `fixRelativeUrls` now
    applies corrected `background-image` urls directly instead of stashing them in
    `data-background`+`swiper-lazy`, and the `lazy.load()` call is gone. Loading is
    still bounded by our own placeholder-slide scheme (BL-7652), which only gives real
    content to slides within 1 of the current page. Theoretical regression: those 2-3
    nearby pages now fetch background images slightly earlier than swiper-lazy did.
    **Check a book with background-image pictures and a motion book** (the old comment
    warned pictures could vanish on language change without lazy.load(); the e2e
    language test passes, but it uses a text book).
16. **RTL**: the old deep kluges (set `dir` on the element + force `rtl`/`rtlTranslate`
    fields) are replaced by the supported `dir="rtl"` prop, with the direction in the
    component key so a direction change re-initializes swiper. jsdom test asserts the
    dir attribute; **a real RTL book (page order + swipe direction) needs a storybook
    check.**
17. **Behavior improvement (intentional)**: when the swiper is recreated because
    autoplay/effect changes (BL-11090), `initialSlide` now starts it on the page we
    were already showing, instead of starting at 0 and being corrected afterward.
18. `swiper.params.noSwiping/touchRatio` runtime mutation (activities absorbing
    drag) still works in v11 per docs, and quiz activities pass in e2e, but **drag
    games deserve a manual touch-device check.**
19. The superseded storybook `play()` tests (BloomPlayerTester) still reference
    Swiper-4-era details and were NOT updated; they're slated for deletion once the
    e2e suite has proven itself in CI (see E2E-TESTING-PLAN.md).
20. jsdom tests now stub `ResizeObserver` (no-op) because Swiper 11 requires it.
21. Storybook itself was not launched during this work; the stories import paths were
    updated (`@mui/material/styles` in books.stories.tsx) but a `pnpm storybook` smoke
    run is worth doing.

## Suggested review order

1. Skim commits `7b0019a` (extraction) → `64ff088` (registry + listener cleanup) →
   MUI v5 → Swiper 11; each is scoped.
2. `pnpm storybook` + `pnpm watchForStorybook`: walk the Various Books gallery —
   especially an RTL book, a motion book, a background-image book, and the control
   bar/slider in both directions (items 10, 11, 14, 15, 16).
3. Decide the merge/release strategy (items 1–2).
