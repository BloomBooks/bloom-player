# Issue tracker
This project tracks work in **YouTrack**, at https://issues.bloomlibrary.org/youtrack (Kanban
boards). Ticket ids look like **`BL-16572`** (`BL-` plus a number). The skill that talks to it is
**`youtrack-api`**. Use it for every tracker operation: reading an issue, finding the id for the
current work, listing or posting comments, and setting an issue's State. The higher-level
`youtrack-*` skills build on it.

To find the ticket id for the branch you are on, look for a `BL-XXXXX` token in the branch name.
Not every branch has a card. Small cleanups and tooling work are often done without one, so
finding no id is a normal outcome and not a reason to go hunting.

Team-wide workflow skills that are not specific to this repo (the preflight → self-review →
peer-review pipeline, Devin and Reviewable review handling, YouTrack operations) live in
https://github.com/BloomBooks/bloom-team-skills. Install them per its README (clone + symlink
into `~/.claude/skills`).

# Preflight checks

Checks `preflight` runs in this repo, in addition to its own steps.

## The player still runs in the oldest supported browser

Bloom Reader shows books in the phone's Android WebView, and bloom-player has to run in the oldest
one it accepts: the `browserslist` entry in `package.json` (BL-17113). The e2e suite checks the
built bundle's syntax and some browser APIs statically (`e2e/bundle-browser-support.spec.ts`);
this check runs the player in that real old Chromium.

- **When it applies:** the diff changes anything that goes into the built player: anything under
  `src/`, the `dependencies` in `package.json` (or their versions in `pnpm-lock.yaml`),
  `vite.config.ts`, or the `browserslist` entry.
- **What to run:** `pnpm build:standalone`, then `pnpm test:old-chromium`. The first run downloads
  that Chromium (about 50 MB) into `node_modules/.cache`; a run takes about a minute. It has been
  used on Windows; on Linux it needs a display or `xvfb-run` for a Chromium older than 59.
- **What passing means:** it ends with "All books ran in Chrome NN" and exits 0. A book fails if
  it never shows a page or a page turn doesn't happen, or if the old Chromium throws an error that
  current Chromium doesn't. Lines marked "note, from the book's own files" come from a test book's
  own scripts and don't fail the check.
