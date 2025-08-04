# Advanced: Notes on embedding bloom-player into other projects

## Getting the pieces

    `yarn add bloom-player`

This puts the files you need at

    `node_modules/bloom-player/dist`

Copy those wherever you need them for your project.


### Other options

You can install npm, run "npm pack bloom-player", and extract the files from the resulting pack.

You could possibly download the files from the URL above, however, there is no easy way to get a list of all the files needed.

## Notes

The url parameter points to the HTML file that is the core of the bloom book. It's supporting files (images etc) must be available at the expected relative addresses.

(Currently we also support the url pointing to the FOLDER that contains the book files. The book itself must have the same name as the folder, with the extension .htm. In the example above, `C%3A/Users/YourName/AppData/Local/Temp/PlaceForStagingBook/myBookTitle` must yield the book's main folder, containing the html file and the other files it references.)

The display of the book will automatically grow to be as large as will fit in the given space. If the book can rotate, it will pick an orientation depending on whether the window is wider then it is tall. If the book has special behaviors, such as motion/animation when in landscape mode, they will be triggered based on the chosen orientation.

`Bloom-player` is designed to be published using `npm` so as to be readily available to a variety of clients. The published version includes both `dist/bloomPlayer-HASH.js`, as well as some mp3 files used by activities.

We deliberately require this component to be used in an `iframe` so that the containing web page is safe from any scripts that might get embedded in Bloom books. For this reason `bloom-player` deliberately manipulates (with `React`) the body of its HTML document.

## CORS permissions

The javascript that makes bloomplayer.htm work needs to load the files from the URL that you pass to it as a param. Unless the URL for bloomplayer.htm has the same 'origin' (basically the part of the URL up to the first slash) as that parameter, browsers will typically consider this a violation of the 'same origin policy' and not allow the book files to be opened.

If you are displaying a book published on Bloom Library, this is not a problem, because we have configured the Bloom Library server to publish the books with the required CORS headers to permit this.

If you are making something entirely independent, you may be able to arrange things so bloomplayer.htm is in fact loaded from the same origin as the book content.

Otherwise, you will have to arrange for the server that is serving the book data to do so with appropriate CORS permissions. Typically there is nothing sensitive in a Bloom book and it is safe to publish it with CORS permissions allowing it to be embedded anywhere.

# Advanced: Notes on using shared code from bloom-player

## Getting and using the shared code

    `yarn add bloom-player`

This shares the code from the files in `src/shared` in

    `node_modules/bloom-player/lib`

To enable using the functions exported from one of the source files in `src/shared`, they need
to be re-exported in the index.ts file, adding a line something like this to
`src/shared/index.ts`:

    `export * from "./srcFileName";

After this setup, and updating the library, the exported function can be imported as expected
into your program's typescript code:

    `import { function1, function2 } from "bloom-player";
