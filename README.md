## Introduction
bloom-player-react is designed to play bloom books, specifically unzipped .bloomd books such as Bloom creates for BloomReader.

You may embed a BloomPlayerCore control directly in another react component or web page, or use BloomPlayerControls to get some standard playback (and eventually appearance) controls.

This is designed to be published using npm so as to be readily available to a variety of clients. The published version includes both the source code, which is convenient to import into other react modules, especially in typescript, and a bundle generated with webpack that is useful for loading directly into a webpage or WebView.

Especially when using the bundle, it may be helpful to make use of the export 

    BloomPlayer.BloomPlayerControls.applyToMarkedElements();

This looks for divs similar to

    <div class="bloom-player-controls" data-url="/data/user/0/org.sil.bloom.reader/files/openBook"></div>

and converts each into a bloom player displaying the indicated book.

## Development

Run yarn to get the dependencies.
Then run webpack to build the output bundle.

You can also use webpack --config webpack-config-prod.js to build a 'production' bundle, which is minified to less than half the size. Currently while this module and its clients are in the early stages of development we are pushing the unminified version to npm for greater ease of debugging.

##License
MIT
