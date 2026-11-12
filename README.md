# bloom-player

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bloombooks/bloom-player)

This project, _bloom-player_, lets users view and interact with [Bloom](https://bloomlibrary.org) books in any browser.

The Bloom project uses _bloom-player_ in the following places:

- In [Bloom Editor](https://github.com/bloombooks/bloomdesktop), on the Publish tab, for previewing what the book will look like on a device.
- In the [Bloom Reader](https://github.com/bloombooks/bloomreader) Android app
- On [BloomLibrary.org](https://bloomlibrary.org)
- In [BloomPUB Viewer](https://github.com/bloombooks/bloompub-viewer)
- In Android and iOS apps created with Reading App Builder

# Using bloom-player in a website

We serve bloom-player from a CDN at

    https://bloomlibrary.org/bloom-player/bloomplayer.htm

So to embed a book in your website, you just need an iframe element that points to it:

```html
<iframe
  src="https://bloomlibrary.org/bloom-player/bloomplayer.htm?url=https%3A%2F%2Fexample.org%2Fbooks%2Fmy-book%2Findex.htm"
  allow="autoplay; fullscreen"
  style="width: 100%; height: 600px; border: none"
></iframe>
```

The player grows to fill the iframe, so give the iframe a size; otherwise the browser makes it 300×150 pixels.

The `allow` attribute lets the book play narration without a click first (where the browser permits it) and lets the user switch to full screen.

The `url` parameter is the absolute http(s) URL of the book's HTML file, URL-encoded with `encodeURIComponent`. The file name must end in `.htm` (not `.html`); a URL that doesn't is treated as a folder. So the `url` can instead be the URL of the book's folder, if the HTML file in it has the folder's name plus `.htm`. A relative URL is resolved against the root of the player's origin (e.g. `https://bloomlibrary.org/`), not against your page or the player's folder. If the book is not on the same origin as the player, its server must send CORS headers that allow it. See [README-advanced.md](README-advanced.md) for more on folder URLs and CORS.

## Optional parameters

You can customize some aspects of the bloom-player to fit your context. For example, if you never want to show the [app bar](https://m2.material.io/components/app-bars-top), use:

```html
<iframe
  src="https://bloomlibrary.org/bloom-player/bloomplayer.htm?url=https%3A%2F%2Fexample.org%2Fbooks%2Fmy-book%2Findex.htm&initiallyShowAppBar=false&allowToggleAppBar=false"
  allow="autoplay; fullscreen"
  style="width: 100%; height: 600px; border: none"
></iframe>
```

Boolean parameters are true only when set to `true` (in any case). Anything else, such as `1` or `yes`, counts as false.

### initiallyShowAppBar

Show the [app bar](https://m2.material.io/components/app-bars-top) above the book when the book is first displayed.

Example: `initiallyShowAppBar=false`

Default: `true`

### allowToggleAppBar

If the user clicks in a content area of the page, toggle display of the app bar.

Example: `allowToggleAppBar=true`

Default: `false`

### showBackButton

If true, displays a button in the upper left corner of the app bar. When clicked, bloom-player posts a message "backButtonClicked" that your host can catch and respond to.

Example: `showBackButton=true`

Default: `false`

> **Note:** If bloom-player is the top level window (e.g. in Bloom Reader), this button will be a left arrow. However if bloom-player is embedded in another page (e.g. in an iframe), it will show as an ellipsis, unless `backButtonIcon` says otherwise.
>
> The ellipsis is used in BloomLibrary.org when the user has used a link from somewhere else to jump directly into reading a book. In that case, this button isn't really taking them "back", it's instead taking them to the "Detail" page for that same book on BloomLibrary.org.
>
> Once the user has followed a link within the book to another page or book, the button is an arrow that returns them to where they came from, and clicking it posts no message. This arrow appears even when `showBackButton` is false.

### backButtonIcon

Which icon to show on the button that `showBackButton` adds: `arrow` or `ellipsis`. Use this when embedding bloom-player in an iframe in an app whose back button really does go back, so it should be an arrow.

Example: `showBackButton=true&backButtonIcon=arrow`

Default: none (bloom-player chooses, as described under `showBackButton`)

### lang

If set, determines the initial language to be displayed. The user can still change the display language using the language picker.

Example: `lang=fr`

Default: none (The initial language will be the vernacular language when the book was published.)

### hideFullScreenButton

If true, the Full Screen icon button will not appear in the upper right hand corner of the window. Otherwise, a Full Screen icon button is displayed and allows the user to toggle between full screen and window mode, as long as the browser allows full screen. In an iframe, that requires `allow="fullscreen"`.

Example: `hideFullScreenButton=true`

Default: `false`

### independent

If true, bloom-player reports its own analytics directly to Segment (through Bloom's analytics proxy). If false, bloom-player sends messages to its host, and the host is responsible for reporting analytics.

Example: `independent=false`

Default: `true`

### host

Identifies the host in analytics. If it is not set, no host is reported (except `testing` when bloom-player runs on localhost).

When the player is not served from bloomlibrary.org, the host's name also appears in the message telling the user that a book needs a newer version of the host.

With `independent=false`, the `updateBookProgressReport` messages sent to the host include `readDuration` only when `host=bloomlibrary`.

Examples: `host=bloomlibrary` or `host=bloomreader` or `host=bloompubviewer` or `host=readerapp`

Default: none

### autoplay

Whether bloom-player advances through the pages on its own. `yes` autoplays any book, `motion` autoplays only motion books, and only when they are shown in landscape, and `no` never autoplays. This doesn't control narration, which plays on each page whether or not the book advances (if the browser allows it); use `paused=true` to keep it from starting.

Example: `autoplay=yes`

Default: `motion`

### start-page

Open the book at this page. It is a 0-based index into the list of pages and ignores the page numbers printed on them. In a collection of linked books, it applies only to the first book.

Example: `start-page=3`

Default: the first page

### autoplay-count

How many pages to autoplay before stopping. Only takes effect when `start-page` is also given, and only when the book is autoplaying.

Example: `start-page=3&autoplay-count=2`

Default: none (play to the end)

### paused

Start with playback paused.

Example: `paused=true`

Default: `false`

### defaultDuration

How many seconds autoplay stays on a page that has no narration.

Example: `defaultDuration=5`

Default: `3.0`

### hideNavButtons

Hide the next and previous page buttons. Mainly useful with `autoplay=yes`.

Example: `hideNavButtons=true`

Default: `false`

### skipActivities

Leave out interactive (activity) pages. Useful for non-interactive uses such as autoplaying a book to record a video.

Example: `skipActivities=true`

Default: `false`

### centerVertically

Center the page vertically in the available space.

Example: `centerVertically=false`

Default: `true`

### extraButtons

Extra buttons to add to the app bar, as URL-encoded JSON. Each button has an `id`, an `iconUrl` and an optional `description` (its tooltip and accessible label). When the user clicks a button, bloom-player posts a message whose `messageType` is that button's `id`.

```js
const buttons = [
  { id: "fullScreen", iconUrl: "https://example.org/fullscreen.svg", description: "Full screen" },
];
const param = "extraButtons=" + encodeURIComponent(JSON.stringify(buttons));
```

Default: none

### Parameters used by Bloom Editor

Bloom Editor uses these when it previews a book or records it as a video. Other hosts shouldn't need them: `videoPreviewMode`, `videoSettings`, `reportSoundLog`, `useOriginalPageSize`, `roundPageWidthToNearestK` and `roundMarginToNearestK`.

## How to support books that link to other books

Some books are designed to be published together as a collection. These books may link to each other using underlined phrases or buttons. Users can click on these links and also backtrack. You can see examples of this in the Storybook stories under "MultiBook".

Instead of asking your host to handle the navigation, history, etc., this navigation happens within the one instance of Bloom Player. However, Bloom Player needs your help, because it does not have a way to know what the URL to each book is in the context of your host, which could be a website, an app, a desktop program, etc. So if you want to support these collections of linked books, your host has to do some extra work.

Bloom books link to each other using each book's "Instance ID". This is a guid that is given as a property in the `meta.json` file:

```jsonc
{
  "bookInstanceId":"0b82aab3-61fb-429e-864f-ce7671a3d372",
  "title":"หมู่บ้านแห่งความดี\r\nVillage of good",
  "credits":"มิได้จัดจำหน่าย  แต่จัดทำเพื่อส่งเสริมการเรียนรู้",
  "tags":["topic:Fiction"],
  "pageCount":16
  // ...and other properties
}
```

(To see a book's Instance ID while it is open in Bloom Player, click in the player and hold down the CTRL key.)

When Bloom Player wants to switch to a different book, it starts requesting that book's files under `/book/THE-INSTANCE-ID/` on the same origin the current book was loaded from, e.g. `/book/THE-INSTANCE-ID/.distribution`, `/book/THE-INSTANCE-ID/meta.json` and `/book/THE-INSTANCE-ID/index.htm`. Be prepared to receive several of these before you've handled the first one.

To support this, your host needs to:

1. intercept those requests
2. extract the Instance ID
3. figure out the path to that book in your system
4. if the target is still zipped in a BloomPUB, unzip it or read the resource directly out of the archive
5. return the requested file (and do the same for every later request for that book's files). The book's main HTML file must be reachable as `/book/THE-INSTANCE-ID/index.htm`.

Depending on your situation, you may find handling this as simple as doing a 302 redirect (as Bloom Editor does), or you may want to take each incoming URL and return the contents of that file (as BloomPUB Viewer does).

If step (3) is slow, you might need to cache or even pre-prepare an index for use at runtime.

As an example, in this repository, the file `.storybook/main.ts` sets up Storybook's vite dev server to proxy a couple of instance ids to the right folders in this repository's `public/testBooks` directory.

# Development

If you haven't already, install [Volta](https://volta.sh) globally. Volta takes care of getting all the correct versions of things like node and pnpm to match what this repository expects.

Run `pnpm install` to get the dependencies.

To build the standalone js file that can be used from an html file:

```bash
pnpm build:standalone
```

To build the library used by Bloom Editor:

```bash
pnpm build:sharedlib
```

To try your changes, run `pnpm dev`. It serves the source directly (no build needed), watches it, and opens `index-for-developing.html`; edit that file to point to a different book.

Or run `pnpm storybook`, which has many test books. Storybook won't start without a `dist/` folder, so run `pnpm build:standalone` once first. Most stories run from source and update as you edit. The ones that embed `bloomplayer.htm` in an iframe (MultiBook and Automated/Navigation) use `dist/`, so rebuild for those after changing the code, or keep `pnpm watchForStorybook` running.

See package.json for other scripts.

## Testing with a book hosted on the web

Depending on what book you are loading, if the book is on bloomlibrary.org or dev.bloomlibrary.org, CORS headers there may prevent your local bloom-player from loading the book, because it is not in the right domain. To get around this, `pnpm dev` and `pnpm storybook` run a proxy (configured in `vite.config.ts`) that fetches the book for you. With it, refer to a book on Bloom Library's S3 storage with a URL that starts with `s3/` in place of `https://s3.amazonaws.com/`.

## Testing with a book hosted by Bloom

To test Bloom Player on a book in the Bloom Editor, follow these steps:

1. Go to the Publish tab in Bloom, choose "BloomPUB", and click "Preview".
2. Back in this repository, run storybook (`pnpm storybook`).
3. Choose the "Live From Bloom Editor" story (under "Various books").

## Running unit tests

To run unit tests use `pnpm test` (it keeps watching for changes; `pnpm test run` runs once). This runs all `*.test.ts` and `*.test.tsx` files under `src/`, which should be colocated with the thing being tested. These are vitest + jsdom tests.

## Running end-to-end (browser) tests

The vitest tests run in jsdom, which can't exercise real-browser behavior such as swiper page-turning geometry, the audio autoplay policy, or the actual built `dist/bloomplayer.htm` artifact that hosts embed. Those are covered by a Playwright suite under `e2e/`.

The first time, install the browser the tests use:

```bash
pnpm exec playwright install chromium
```

Because the e2e tests run against the built standalone bundle, build it first:

```bash
pnpm build:standalone
pnpm test:e2e
```

`pnpm test:e2e:build` does both in one step, and `pnpm test:e2e:ui` opens the Playwright UI. The suite serves `dist/` plus the hermetic `public/testBooks/` fixtures via `e2e/server.mjs`; no network access or external books are required. See [E2E-TESTING-PLAN.md](E2E-TESTING-PLAN.md) for the design and the initial list of specs.

## Version Info

If you click in the player and hold down the CTRL key, Bloom Player will display its version, build date and the book's Instance ID.

# More info

See [README-advanced.md](README-advanced.md) for more information on embedding bloom-player into other projects and
on using shared code functions in other projects.

# License

MIT
