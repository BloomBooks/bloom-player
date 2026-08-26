import axios from "axios";

// The book-fetching part of loading a book: figuring out the actual .htm url
// and folder prefix from the url we were given, downloading the book's html,
// meta.json, and .distribution, and parsing the html. Extracted from
// BloomPlayerCore.componentDidUpdate as part of the react modernization
// (Phase 1); no component state involved.

export interface IBookUrlParts {
    // the url of the book's .htm file
    urlOfBookHtmlFile: string;
    // the folder containing the htm file; other book resources are relative to this
    urlPrefix: string;
}

// We support two ways of interpreting URLs.
// If the url ends in .htm, it is assumed to be the URL of the htm file that
// is the book itself. The last slash indicates the folder in which all the
// other resources may be found.
// For compatibility with earlier versions of bloom-player, the url may be a folder
// ending in the book name, and the book is assumed to occur in that folder and have
// the same name as the folder.
// Note: In the future, we are thinking of limiting to
// a few domains (localhost, dev.blorg, blorg).
// Note: we don't currently look for .html files, only .htm. That's what
// Bloom has consistently created, both in the old .bloomd files, in .bloompub files, and in
// book folders, so it doesn't seem worth complicating the code
// to look for the other as well.
export function computeBookUrlParts(sourceUrl: string): IBookUrlParts {
    const slashIndex = sourceUrl.lastIndexOf("/");
    const encodedSlashIndex = sourceUrl.lastIndexOf("%2f");
    let filename: string;
    if (slashIndex > encodedSlashIndex) {
        filename = sourceUrl.substring(slashIndex + 1, sourceUrl.length);
    } else {
        filename = sourceUrl.substring(encodedSlashIndex + 3, sourceUrl.length);
    }
    // Note, The current best practice is actually to have the htm file always be "index.htm".
    // Most (all?) bloom-player hosts are already looking for that, then looking for a name
    // matching the zip file's name, then going with the first.
    const haveFullPath = filename.endsWith(".htm");
    const urlOfBookHtmlFile = haveFullPath
        ? sourceUrl
        : sourceUrl + "/" + filename + ".htm";
    const urlPrefix = haveFullPath
        ? sourceUrl.substring(0, Math.max(slashIndex, encodedSlashIndex))
        : sourceUrl;
    return { urlOfBookHtmlFile, urlPrefix };
}

export function fullUrl(url: string | null, urlPrefix: string): string {
    // Enhance: possibly we should only do this if we somehow determine it is a relative URL?
    // But the things we apply it to always are, in bloom books.
    return urlPrefix + "/" + url;
}

export interface ILoadedBook {
    bookHtmlElement: HTMLHtmlElement;
    metaDataObject: any;
    distributionSource: string;
}

// Fetch the book's htm file, meta.json, and .distribution, and parse the html.
// Rejects (with the axios error) if the htm or meta.json cannot be fetched;
// a missing .distribution is normal and yields an empty string.
export async function loadBook(
    urlOfBookHtmlFile: string,
    urlPrefix: string,
): Promise<ILoadedBook> {
    // Note: this does not currently seem to work when using the storybook fileserver.
    // I hypothesize that it automatically filters files starting with a period,
    // so asking for .distribution fails even if the local book folder (e.g., Testing
    // away again) contains a .distribution file. I just tested using a book locally
    // published through the Bloom Editor server.
    const distributionPromise = axios
        .get(fullUrl(".distribution", urlPrefix))
        .then(
            (result) => {
                return result;
            },
            // Very possibly the BloomPUB doesn't have this file. The only way to find this
            // out is by the request failing. We don't consider this a 'real' failure and
            // just fulfil the promise with an object indicating that distribution is an
            // empty string.
            (error) => {
                return { data: "" };
            },
        );
    const htmlPromise = axios.get(urlOfBookHtmlFile);
    const metadataPromise = axios.get(fullUrl("meta.json", urlPrefix));
    const [htmlResult, metadataResult, distributionResult] = await Promise.all([
        htmlPromise,
        metadataPromise,
        distributionPromise,
    ]);
    // Note: we do NOT want to try just making an HtmlElement (e.g., document.createElement("html"))
    // and setting its innerHtml, since that leads to the browser trying to load all the
    // urls referenced in the book, which is a waste and also won't work because we
    // haven't corrected them yet, so it can trigger yellow boxes in Bloom.
    const parser = new DOMParser();
    // we *think* bookDoc and bookHtmlElement get garbage collected
    const bookDoc = parser.parseFromString(htmlResult?.data, "text/html");
    return {
        bookHtmlElement: bookDoc.documentElement as HTMLHtmlElement,
        metaDataObject: metadataResult?.data,
        distributionSource: (distributionResult as any).data,
    };
}

// When working on the ABC-BARMM branding/XMatter pack, we discovered that the classes on the
// Desktop body element were not getting passed into bloom-player.
// Unfortunately, just putting them on the body element doesn't work because we are using
// scoped styles. So we put them on the div.bloomPlayer-page (and then we have to adjust the rules
// so they'll work there).
// Other xmatter uses other info than classes. E.g. Kyrgystan uses the data-bookshelfurlkey attribute
// to control the background color.
export function getBodyAttributes(originalBodyElement: HTMLBodyElement): {
    [name: string]: string | null;
} {
    // convert from the NamedNodeMap to a simple object:
    const result: { [name: string]: string | null } = {};
    for (let i = 0; i < originalBodyElement.attributes.length; i++) {
        result[originalBodyElement.attributes.item(i)!.nodeName] =
            originalBodyElement.attributes.item(i)!.nodeValue;
    }
    return result;
}

// urls of images and videos and audio need to be made
// relative to the original book folder, not the page we are embedding them into.
export function fixRelativeUrls(page: Element, urlPrefix: string) {
    const srcElts = page.ownerDocument!.evaluate(
        ".//*[@src]",
        page,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null,
    );

    for (let j = 0; j < srcElts.snapshotLength; j++) {
        const item = srcElts.snapshotItem(j) as HTMLElement;
        if (!item) {
            continue;
        }
        const srcName = item.getAttribute("src");
        const srcPath = fullUrl(srcName, urlPrefix);
        item.setAttribute("src", srcPath);
    }

    // now we need to fix elements with attributes like this:
    // style="background-image:url('AOR_10AW.png')"
    const bgSrcElts = page.ownerDocument!.evaluate(
        ".//*[@style]",
        page,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null,
    );
    const regexp = new RegExp(/background-image:url\(['"](.*)['"]\)/);

    for (let j = 0; j < bgSrcElts.snapshotLength; j++) {
        const item = bgSrcElts.snapshotItem(j) as HTMLElement;
        if (!item) {
            continue;
        }
        const style = item.getAttribute("style") || ""; // actually we know it has style, but make lint happy
        const match = regexp.exec(style);
        if (!match) {
            continue;
        }
        const newUrl = fullUrl(match[1], urlPrefix);
        const newStyle = style.replace(
            regexp,
            // if we weren't using lazy-load:
            //  "background-image:url('" + newUrl + "'"
            "",
        );
        item.setAttribute("style", newStyle);
        item.setAttribute("data-background", newUrl);
        item.classList.add("swiper-lazy");
    }
}
