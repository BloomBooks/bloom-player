# Advanced: Notes on embedding bloom-player into other projects

## Getting the pieces

```bash
pnpm add bloom-player
```

This puts the files you need in `node_modules/bloom-player/dist`: `bloomplayer.htm`, the hashed JavaScript and CSS files it loads, and the mp3 files that activities use. Copy the whole `dist` folder wherever you need it for your project.

You can, instead, run `npm pack bloom-player` and extract the files from the resulting tarball.

## Notes

The `url` parameter points to the HTML file that is the core of the Bloom book. Its name must end in `.htm` (not `.html`). Its supporting files (images, etc.) must be available at the expected relative addresses.

We also support a `url` that points to the folder containing the book files. In that case the book's HTML file must have the same name as the folder, with the extension `.htm`. For example, `url=https%3A%2F%2Fexample.org%2Fbooks%2FmyBookTitle` (the URL-encoded form of `https://example.org/books/myBookTitle`) loads `https://example.org/books/myBookTitle/myBookTitle.htm`.

The display of the book will automatically grow to be as large as will fit in the given space. If the book can rotate, it will pick an orientation depending on whether the window is wider than it is tall. If the book has special behaviors, such as motion/animation when in landscape mode, they will be triggered based on the chosen orientation.

On a web page, we deliberately require this component to be used in an `iframe` so that the containing web page is safe from any scripts that might get embedded in Bloom books. (Apps can instead load it as the top-level document of a WebView, as Bloom Reader does.) Because it owns its whole document, `bloom-player` renders (with `React`) into its own HTML document rather than into a host page.

## CORS permissions

The JavaScript that makes `bloomplayer.htm` work needs to load the files from the URL that you pass to it as a parameter. Unless the URL for `bloomplayer.htm` has the same "origin" (basically the part of the URL up to the first single slash) as that parameter, browsers will typically consider this a violation of the "same origin policy" and not allow the book files to be opened.

If you are displaying a book published on Bloom Library with the player served from bloomlibrary.org (https://bloomlibrary.org/bloom-player/bloomplayer.htm), this is not a problem: Bloom Library's book storage sends CORS headers that allow bloomlibrary.org. It does not allow arbitrary origins, so a copy of the player hosted elsewhere cannot load books straight from Bloom Library.

If you are making something entirely independent, you may be able to arrange things so `bloomplayer.htm` is in fact loaded from the same origin as the book content.

Otherwise, you will have to arrange for the server that is serving the book data to do so with appropriate CORS permissions. Typically there is nothing sensitive in a Bloom book and it is safe to publish it with CORS permissions allowing it to be embedded anywhere.

# Advanced: Notes on using shared code from bloom-player

## Getting and using the shared code

```bash
pnpm add bloom-player
```

This puts the shared code, built from the files in `src/shared`, in `node_modules/bloom-player/lib`. Import it in your TypeScript code as usual:

```ts
import { function1, function2 } from "bloom-player";
```

Only what `src/shared/index.ts` re-exports is available. To share functions from another file in `src/shared`, a bloom-player developer adds a line like this to `src/shared/index.ts`, then builds (`pnpm build:sharedlib`) and publishes a new version:

```ts
export * from "./srcFileName";
```

## Debugging bloom-player development in another program (pnpm 11)

In the other program's development folder where package.json lives, use this command (with a relative or absolute path):

```bash
pnpm link <path-to-bloom-player>
```

When you are through debugging bloom-player in the other program, go to the same folder and type:

```bash
pnpm unlink bloom-player
```

See the [pnpm link documentation](https://pnpm.io/cli/link) for current usage details.
