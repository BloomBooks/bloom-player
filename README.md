# Introduction

This project, _bloom-player_, lets users view and interact with [Bloom](bloomlibrary.org) books in any browser.

Specifically, the books must be in _BloomPub_ format (.bloompub or .bloomd, which are files are zipped Bloom Digital books).

The Bloom project uses _bloom-player_ is used in the following places:

-   In the Bloom Reader tab of Publish, for previewing what the book will look like on a device.
-   In Bloom Reader itself (starting with BR version 2.0)
-   On BloomLibrary.org

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

If true, displays an arrow in the upper left corner of the app bar. When clicked, bloom-player will post a message "backButtonClicked" that the surrounding context can catch and respond to.

Example: `showBackButton=true`

Default: `false`

#### lang

If set, determines the initial language to be displayed. The user can still change the display language using the language picker.

Example: `lang=fr`

Default: none (The initial language will be the vernacular language when the book was published.)

#### hideFullScreenButton

If true, the Full Screen icon button will not appear in the upper right hand corner of the window.  Otherwise, a Full Screen icon button is displayed and allows the user to toggle between full screen and window mode.

Example: `hideFullScreenButton=true`

Default: `false`

#### independent

If true, bloom-player reports its own analytics directly to segment.  If false, bloom-player sends messages to its host, and the host is responsible for reporting analytics.

Example: `independent=false`

Default: `true`

#### host

If set, provides a host value for analytics.  If not set, bloom-player attempts to derive a value from the available information if independent is `true` (information can be limited in an iframe) and does nothing otherwise.

Examples: `host=bloomlibrary` or `host=bloomreader` or `host=bloompubviewer` or `host=readingapp` or `host=embed@xyzzy.org`

Default: nothing/undefined ??

# Development

Run `yarn` to get the dependencies.

Either, run `yarn storybook` (which has multiple books),

or run `yarn start` (which will use `index-for-developing.html`).

Note: you need to have `chrome` on your path.

See package.json for other scripts.

### Testing with a book hosted on the web

Depending on what book you are loading, if the book is on bloomlibrary.org or dev.bloomlibrary.org, CORS headers there will normally prevent your local bloom-player from loading the book, because it is not in the right domain. To get around this, you need to run your browser in a special low-security mode.

Both `yarn storybook` and `yarn start` do this for you.

### Testing with a book hosted by Bloom

Note that while testing, one option is to run Bloom, select your book, go to the publish tab, and choose Bloom Reader. Bloom will make the book available through its local fileserver. Modify index.html to use a path like this

    <iframe src="bloomplayer.htm?url=http://localhost:8089/bloom/C%3A/Users/YourName/AppData/Local/Temp/PlaceForStagingBook/myBookTitle"/>

For more information, see README-advanced.md

## License

MIT
