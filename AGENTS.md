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

# Browser support

bloom-player must run in the oldest browser in `package.json`'s `browserslist`: Chrome 54, because
Bloom Reader runs it in old Android WebViews (BL-17113). The build rewrites newer *syntax*
automatically, but adds no polyfills, so browser *APIs* must exist in that version. Before using a
newer API (e.g. `Array.prototype.at`, `Object.fromEntries`, `structuredClone`, `globalThis`,
`ResizeObserver`, `AbortController`), check MDN's compatibility table and add a fallback or a
small polyfill if needed. A book-folder activity script needs ES modules, so Chrome 61+.
`e2e/bundle-browser-support.spec.ts` and `pnpm test:old-chromium` check this; see Preflight
checks below.

`browserslist` is the one place the version is set. To change it, change these together:

- `browserslist` in `package.json`. `vite.config.ts` builds for it (`minimumBrowserTarget`), and
  the e2e test names and the smoke test read it.
- `ecmaVersion` in `eslint.config.js`: the newest syntax that browser parses (ES2016 for Chrome 54).
- `branchPoints` in `scripts/old-chromium-smoke.mjs`: where to find that Chromium build.
- Bloom Reader's `ReaderActivity.haveCurrentWebView` (BloomReader repo), which tells users with an
  older WebView to update. It must not accept a WebView older than this.

These mention the version in prose; update their wording too: `README.md`, the comments in
`vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `src/activities/loadDynamically.js` and
`src/shared/dragActivityRuntime.ts`, and the comment on Bloom Reader's `MINIMUM_CHROME_VERSION`.

# Preflight checks

Checks `preflight` runs in this repo, in addition to its own steps.

## The player still runs in the oldest supported browser

See Browser support above. The e2e suite checks the built bundle's syntax and some browser APIs
statically (`e2e/bundle-browser-support.spec.ts`); this check runs the player in that real old
Chromium.

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

This check isn't in CI, so a change that doesn't go through an agent's preflight (a human's PR,
a bot's dependency bump) skips it. We could consider also running `pnpm test:old-chromium` in
`.github/workflows/release.yml`, which already builds on Ubuntu; its Linux path (`xvfb-run`) hasn't
been tried yet.
