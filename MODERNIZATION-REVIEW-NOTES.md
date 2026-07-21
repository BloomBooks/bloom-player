# Review notes: modernization Phases 1–2 (July 2026)

Working notes on every judgment call made while executing Phases 1–2 of
[REACT-MODERNIZATION-PLAN.md](REACT-MODERNIZATION-PLAN.md) autonomously. Each phase is
a branch stacked on the previous one:

| Branch | Commit | Verified |
| --- | --- | --- |
| `phase1-shrink-core` | `7b0019a` extraction refactor | 117 unit + 12 e2e |
| `phase2-remove-statics` | `64ff088` registry + listener cleanup | 117 unit + 12 e2e |

Phase 3 (the dependency upgrades) is in progress on the stacked branches `phase3a-mui`
→ `phase3b-swiper` and is documented in the sections that those branches append below.

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

## Suggested review order

1. Skim commits `7b0019a` (extraction) → `64ff088` (registry + listener cleanup); each
   is scoped.
2. The one behavior-affecting change is the listener cleanup on unmount (item 8);
   confirm nothing in the hosts depended on the old zombie-listener behavior.
3. Decide the merge/release strategy (items 1–2).
