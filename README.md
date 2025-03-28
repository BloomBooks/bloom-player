# Introduction

This project, _bloom-player_, lets users view and interact with [Bloom](https://bloomlibrary.org) books in any browser.

The Bloom project uses _bloom-player_ in the following places:

- In [Bloom Editor](https://github.com/bloombooks/bloomdesktop) / Publish / Bloom Reader tab, for previewing what the book will look like on a device.
- In the [Bloom Reader](https://github.com/bloombooks/bloomreader) Android app
- On [BloomLibrary.org](https://bloomlibrary.org)
- In [BloomPUB Viewer](https://github.com/bloombooks/bloompub-viewer)
- In Android and IOS apps created with Reading App Builder

# Using bloom-player in a website

We serve bloom-player from a CDN at

    https://bloomlibrary.org/bloom-player/bloomplayer.htm

So to embed a book in your website, you just need an iframe element that points to it:

```html
<iframe
  src="https://bloomlibrary.org/bloom-player/bloomplayer.htm?url=path-to-your-book"
></iframe>
```

Advanced: if you want to just show a spinning wheel, you can supply `url=working` and then render it again when you have an actual url.

# Optional Parameters

You can customize some aspects of the bloom-player to fit your context. For example, if you never want to show the [app bar](https://material.io/design/components/app-bars-top.html),

```html
<iframe
  src="https://bloomlibrary.org/bloom-player/bloomplayer.htm?url=path-to-your-book&initiallyShowAppBar=false&allowToggleAppBar=false"
></iframe>
```

#### initiallyShowAppBar

Show the [app bar](https://material.io/design/components/app-bars-top.html) above the book when the book is first displayed.

Example: `initiallyShowAppBar=false`

Default: `true`

#### allowToggleAppBar

If the user clicks in a content area of the page, toggle display of the app bar.

Example: `allowToggleAppBar=true`

Default: `false`

#### showBackButton

If true, displays a button in the upper left corner of the app bar. When clicked, bloom-player will post a message "backButtonClicked" that the your host can catch and respond to.

Example: `showBackButton=true`

Default: `false`

> [!NOTE]
> Normally this button will be a left arrow. However if bloom-player is the top level window (i.e. it is not embedded in another page), it will show as an ellipsis.
>
> This is used in BloomLibrary.org when the user has used a link from somewhere else to jump directly into to reading a book. In that case, this button isn't really taking them "back", it's instead taking them to the "Detail" page for that same book on BloomLibrary.org.

#### lang

If set, determines the initial language to be displayed. The user can still change the display language using the language picker.

Example: `lang=fr`

Default: none (The initial language will be the vernacular language when the book was published.)

#### hideFullScreenButton

If true, the Full Screen icon button will not appear in the upper right hand corner of the window. Otherwise, a Full Screen icon button is displayed and allows the user to toggle between full screen and window mode.

Example: `hideFullScreenButton=true`

Default: `false`

#### independent

If true, bloom-player reports its own analytics directly to segment. If false, bloom-player sends messages to its host, and the host is responsible for reporting analytics.

Example: `independent=false`

Default: `true`

#### host

If set, provides a host value for analytics. If not set, bloom-player attempts to derive a value from the available information if independent is `true` (information can be limited in an iframe) and does nothing otherwise.

Examples: `host=bloomlibrary` or `host=bloomreader` or `host=bloompubviewer` or `host=readerapp`

...or, theoretically, `host=embed@xyzzy.org` (but we haven't used that yet)

Default: `nothing/undefined`

# How to support books that link to other books

Some books are designed to be published together as a collection. These books may link to each other using underlined phrases or buttons. Users can click on these links and also backtrack. You can see examples of this in the StoryBook stories under "MultiBook".

Instead of asking your host to handle the navigation, history, etc., this navigation happens within the one instance of Bloom Player. However, Bloom Player needs your help, because it does not have a way to know what the URL to each book is in the context of your host, which could be a website, an app, a desktop program, etc. So if you want to support these collections of linked books, your host has to do some extra work.

Bloom books link to each other using each book's "Instance ID". This is a guid that is given as a property in the `meta.json` file:

```json
{
  "bookInstanceId":"0b82aab3-61fb-429e-864f-ce7671a3d372",
  "title":"หมู่บ้านแห่งความดี\r\nVillage of good",
  "credits":"มิได้จัดจำหน่าย  แต่จัดทำเพื่อส่งเสริมการเรียนรู้",
  "tags":["topic:Fiction"],
  "pageCount":16,
```

To support this, your host needs to:

1. intercept that request
2. extract the Instance ID
3. figure out the path to that book in your system
4. if the target is still zipped in a BloomPUB, you may need to unzip it or read the resource directly out of the archive
5. handle the incoming urls for all subsequent.

Note that when Bloom Player wants to switch to a different book, it will start requesting resources, e.g. `/book/THE-INSTANCE-ID/.distribution`, `/book/THE-INSTANCE-ID/meta.json` and `/book/THE-INSTANCE-ID/index.htm`. Be prepared to receive several of these before you've handled the first one.

Depending on your situation, you may find handling this as simple as doing a 302 redirect (as Bloom Editor does), or you may want to take each incoming URL and return the contents of that file (as BloomPUB Viewer does).

If step (3) is slow, you might need to cache or even pre-prepare an index for use at runtime.

As an example, in this repository, the file `.storybook/main.ts` sets up Storybook's vite dev server to proxy a couple instance ids to correct folders in this repository's `/public/testBooks` directory.

# Development

If you haven't already, install `volta` globally. Volta takes care of getting all the correct versions of things like node and yarn to match what this repository expects.

Run `yarn` to get the dependencies.

Either run `yarn storybook` (which has multiple books),

or run `yarn dev` (which will use `index-for-developing.html`).

To build the standalone js file that can be used from an html file:

```bash
yarn build:standalone
```

To build the library used by the Bloom Editor

```bash
yarn build:sharedlib
```

See package.json for other scripts.

### Testing with a book hosted on the web

Depending on what book you are loading, if the book is on bloomlibrary.org or dev.bloomlibrary.org, CORS headers there will normally prevent your local bloom-player from loading the book, because it is not in the right domain. To get around this, you need to run your browser in a special low-security mode.

Both `yarn storybook` and `yarn dev` do this for you.

### Testing with a book hosted by Bloom

To test Bloom Player on a book in the Bloom Editor, follow these steps:

1. Go to the Publish tab in Bloom, choose "BloomPUB", and click "Preview".
2. Back in this repository, run storybook (`yarn storybook`).
3. Choose the "Live From Bloom Editor" story.

### Running unit tests

To run unit tests use `yarn test`. This will run all `*.test.ts`, which should be collocated with the thing being tested.


### Version Info

If you hold down the CTRL key, Bloom Player will display its version and build date.

### More info

For more information, see README-advanced.md

## License

MIT
