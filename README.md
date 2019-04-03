## Introduction
bloom-player-react is designed to play Bloom books, specifically unzipped .bloomd books such as Bloom creates for BloomReader.

You may embed a BloomPlayerCore control directly in another react component or web page, or use BloomPlayerControls to get some standard playback (and eventually appearance) controls.

This is designed to be published using npm so as to be readily available to a variety of clients. The published version includes both the source code, which is convenient to import into other react modules, especially in typescript, and a bundle generated with webpack that is useful for loading directly into a webpage or WebView.

Especially when using the bundle, it may be helpful to make use of the export 

    BloomPlayer.BloomPlayerControls.applyToMarkedElements();

This looks for divs similar to

    <div class="bloom-player-controls" data-url="/data/user/0/org.sil.bloom.reader/files/openBook"></div>

and converts each into a BloomPlayerControls displaying the indicated book.

The individual components are also published in the lib directory. In typescript they may be imported with code like this:

    import { BloomPlayerCore } from "bloom-player-react/lib/bloom-player-core";

## Development

Run yarn to get the dependencies.
Then use npm run build to build the dev output bundle.
Use npm run build-prod to build the production (minified) output bundle
You should run both of these (and tweak the version number) before publishing.

##License
MIT
