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

Note that while testing, one option is to run Bloom, select your book, go to the publish tab, and choose Bloom Reader. Bloom will make the book available through its local fileserver. Modify index.html to use a path list this

    <iframe src="bloomplayer.htm?url=http://localhost:8089/bloom/C%3A/Users/YourName/AppData/Local/Temp/PlaceForStagingBook/myBookTitle"/>

For more information, see README-advanced.md

## License

MIT
