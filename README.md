# Introduction

This project, _bloom-player_, lets users view and interact with [Bloom](bloomlibrary.org) books in any browser.

Specifically, the books must be in _Bloom Digital_ format (.bloomd files are zipped Bloom Digital books).

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

# Development

Run `yarn` to get the dependencies.

Run `yarn start`. See package.json for other scripts.

### Testing with a book hosted on the web

If your `index-for-developing.html` has a `src` attribute with a `url` parameter pointing at a book on bloomlibrary.org or dev.bloomlibrary.org, CORS headers there will normally prevent your local bloom-player from loading the book, because it is not in the right domain. To get around this, you need to run your browser in a special low-security mode:

Run `yarn chrome-no-cors`. This requires that the directory containing Chrome be on your `PATH` variable.

Note that `yarn start` uses webpack-devserver, and we have not figured out how to make webpack-devserver launch Chrome in this low-security mode, so if you are going to be loading books from one of these domains it is up to you to launch Chrome with CORS security off. You have to do this independent of running `yarn start`. `yarn start` will always open a tab in a _normal_ Chrome, which will fail to load the book. That's ok though, becuase your other Chrome window, the one with security off, will _also_ load the page, and respond to hot-reloads.

### Testing with a book hosted by Bloom

Note that while testing, one option is to run Bloom, select your book, go to the publish tab, and choose Bloom Reader. Bloom will make the book available through its local fileserver. Modify index.html to use a path list this

    <iframe src="bloomplayer.htm?url=http://localhost:8089/bloom/C%3A/Users/YourName/AppData/Local/Temp/PlaceForStagingBook/myBookTitle"/>

For more information, see README-advanced.md

## License

MIT
