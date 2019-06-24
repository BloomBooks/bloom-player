## Introduction

bloom-player lets you interact with [Bloom](bloomlibrary.org) books that have been prepared for electronic publication. For example, the contents of a .bloomd (bloom-player cannot unzip .bloomd's).

To use bloomplayer.js,

    1. Get bloomplayer.htm and bloomplayer.min.js into your project.

    2. Open the book in Bloom Desktop and navigate to Publish => Bloom Reader.

    2. In an iframe or webview navigate to bloomplayer.htm with a url that tells it where to find the book's html.

    Example:

    <iframe src="bloomplayer.htm?url=http://localhost:8089/bloom/C%3A/Users/YourName/AppData/Local/Temp/PlaceForStagingBook/myBookTitle"/>

## Notes

Currently, the url parameter points to the FOLDER that contains the book files. The book itself must have the same name as the folder, with the extension .htm. In the example above, `C%3A/Users/YourName/AppData/Local/Temp/PlaceForStagingBook/myBookTitle` must yield the book's main folder, containing the html file and the other files it references.

The display of the book will automatically grow to be as large as will fit in the given space. If the book can rotate, it will pick an orientation depending on whether the window is wider then it is tall. If the book has special behaviors, such as motion/animation when in landscape mode, they will be triggered based on the chosen orientation.

`Bloom-player` is designed to be published using `npm` so as to be readily available to a variety of clients. The published version includes both `dest/bloomPlayer.js` and `dest/bloomPlayer.min.js`.

We deliberately require this component to be used in an `iframe` so that the containing web page is safe from any scripts that might get embedded in Bloom books. For this reason `bloom-player` deliberately manipulates (with `React`) the body of its HTML document.

## Development

Run `yarn` to get the dependencies.
Then use `yarn build` to build the outputs.
You can also use `yarn run build-dev` or `build-prod` to build just the dev or production versions.
You should also tweak the version number before publishing.

##License
MIT
