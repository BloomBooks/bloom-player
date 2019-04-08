## Introduction
bloom-player is designed to play Bloom books, specifically unzipped .bloomd books such as Bloom creates for BloomReader.

You should make a very simple html document, similar to test/testPage.htm, and make it the root document of an iframe or WebView. The src url for the iframe or WebView must specify a parameter in addition to the document, which must give the url of the folder where the bloom book can be found.

The display of the book will automatically grow to be as large as will fit in the given space. If the book can rotate, it will pick an orientation depending on whether the window is wider then it is tall. If the book has special behaviors, such as motion/animation when in landscape mode, they will be triggered based on the chosen orientation.

Bloom-player is designed to be published using npm so as to be readily available to a variety of clients. The published version includes both dest/bloomPlayer.js and dest/bloomPlayer.min.js.

We deliberately require this component to be used in an iframe so that the containing web page is safe from any scripts that might get embedded in Bloom books. For this reason bloom-player deliberately manipulates (with React) the body of its HTML document.

## Development

Run yarn to get the dependencies.
Then use yarn run build to build the outputs.
You can also use yarn run build-dev or build-prod to build just the dev or production versions.
You should also tweak the version number before publishing.

##License
MIT
