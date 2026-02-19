import { Environment } from "./Environment";

// This file contains code for sending analytics information to segment.io.

// Important notes about analytics/session state and host lifecycle
//
// Bloom Player analytics/progress reporting keeps some per-book-session state in memory
// (module-level variables in this file, and state inside BookInteraction) and in localStorage
// (e.g. bloom-player-read-duration). This assumes that a “book session” corresponds to the
// lifetime of a single bloom-player document (iframe/WebView load -> unload).
//
// If a host ever reuses the same bloom-player document to show multiple books without reloading,
// state can leak from one book into the next and contaminate analytics.
//
// Two concrete failure modes we’ve seen discussed:
// - BL-15851: Once a book reaches its last numbered page, we send "Pages Read" with
//   lastNumberedPageRead=true and set an in-memory guard (allPagesRead) so we don’t send duplicate
//   "Pages Read" events for that book. If another book is opened in the same JS runtime,
//   allPagesRead could still be true and the later book’s "Pages Read" analytics (and stored
//   progress report) could be suppressed.
// - BL-15852: When switching to a new book, BookInteraction.clearPagesShown() must reset *all*
//   analytics-related state for the new book, not just the sets tracking which pages were shown.
//   If it fails to reset duration accumulators, completion flags, "already reported" flags, or
//   the beginReadTime timestamp, then the next book’s progress report can inherit inflated
//   audio/video durations, incorrect completion status, and incorrect timestamps from the
//   previous book.
//
// Why this is not currently a problem in our main hosts (they reload between books):
// - BloomReader (Android): each book is shown in its own ReaderActivity/WebView and the WebView is
//   destroyed at the end of the reading session; it also uses independent=false and forwards
//   analytics/progress to native code for final reporting.
// - bloomlibrary.org (BloomLibrary2 repo): the Read view hosts bloom-player in an <iframe> whose
//   src is constructed per-book as `/bloom-player/bloomplayer.htm?url=...&independent=false&host=bloomlibrary`.
// - BloomPUB Viewer (Electron): bloom-player runs in an <iframe> whose src points at bloomplayer.htm
//   with a per-book url=... parameter; switching the “primary” book updates the iframe src.
// - Reading App Builder (mobile): Similar to BloomReader, each book is shown in its own WebView.
//
// If a host ever changes to reuse one bloom-player document across multiple books (e.g. linked-book
// navigation without reloading the iframe/WebView), we need to ensure *all* per-book analytics state
// is reset at the start of each new book session.
//
// Note, an important caveat here is that now we do allow book navigation between books using /book/ urls.
// We have yet to figure out how to handle analytics in these cases. This is bigger issue than just the above.

// This block is boilerplate stuff from segment.io.  It is only modified by automatic line breaking and
// to pass typescript, to remove the automatic root-page notification, to extract the line that sets the
// ID so we can make that configurable, and to load a modified analytics.min.js that uses one of our
// proxies rather than sending directly to segment.io.
// Note that this file is adapted from the one used by BloomLibrary2.
/* eslint-disable */
/* tslint:disable */
(function () {
    // tslint:disable-next-line: prefer-const
    var analytics = ((window as any).analytics =
        (window as any).analytics || []);
    if (!analytics.initialize)
        if (analytics.invoked)
            window.console &&
                console.error &&
                console.error("Segment snippet included twice.");
        else {
            analytics.invoked = !0;
            analytics.methods = [
                "trackSubmit",
                "trackClick",
                "trackLink",
                "trackForm",
                "pageview",
                "identify",
                "reset",
                "group",
                "track",
                "ready",
                "alias",
                "debug",
                "page",
                "once",
                "off",
                "on",
                "addSourceMiddleware",
                "addIntegrationMiddleware",
                "setAnonymousId",
                "addDestinationMiddleware",
            ];
            analytics.factory = function (e: any) {
                return function () {
                    var t = Array.prototype.slice.call(arguments);
                    t.unshift(e);
                    analytics.push(t);
                    return analytics;
                };
            };
            for (var e = 0; e < analytics.methods.length; e++) {
                var t = analytics.methods[e];
                analytics[t] = analytics.factory(t);
            }
            analytics.load = function (e: any, t: any) {
                var n = document.createElement("script");
                n.type = "text/javascript";
                n.async = !0;
                // This file would normally be obtained directly from cdn.segment.com
                // as in the comment below, using a URL that depends on our 'e' argument, the ID of the segment.IO
                // 'source' (e.g., plYUfYSopTpXkUxNpV58oGwhPNRSyBzo for bloomlibrary test).
                // We don't want to fetch it from there because segment's URLs seem to be blocked in various
                // places (e.g., PNG). So we are keeping a copy on our own server.
                // We need distinct files, downloaded from the appropriate place
                // in segment.io (see the commented out code below) for each destination (what segment.io
                // calls a source).
                // A possible ToDo is to get this asset built with a hash in its name and put it in static,
                // so clients can cache it indefinitely, but if we publish a new version it will have a new hash
                // and the new version will automatically be used. For now I'm just focusing on getting it to
                // work. But at 343K it would be nice to allow this asset to be cached.
                // Note that this version of analytics{.*}.min.js is also special (as is the one currently on
                // cdn.segment.com) in that, by our request, it sends data to analytics.bloomlibrary.org
                // which is our proxy for api.segment.io. This also helps work around segment.io being blocked.
                // We tried using a proxy to retrieve analytics.min.js, but it doesn't work, because
                // the file comes back with segment.io certificates which the browser notes are not
                // correct for a file supposedly coming from analytics-cdn.bloomlibrary.org. Possibly this
                // could be worked around with an enterprise CloudFlare subscription.
                n.src = getAnalyticsJsFilePath();
                // original version, where the current segment.io version of this lives.
                // "https://cdn.segment.com/analytics.js/v1/" +
                // e +
                // "/analytics.min.js";
                var a = document.getElementsByTagName("script")[0] as any;
                a.parentNode.insertBefore(n, a);
                analytics._loadOptions = t;
            };
            analytics.SNIPPET_VERSION = "4.1.0";
        }
})();
/* tslint:enable */
/* eslint-enable */
// (Note: window.analytics here is typically the array created in the immediately-invokved function above
// to save events that happen before the script in that object's load method is loaded.
// Typically, we would pass in the source key here, but we don't use it anymore since the load function
// loads different files based on where we want to send our analytics (segment sources).

if (!window.location.search.includes("independent=false")) {
    (window as any).analytics.load();
    window.onbeforeunload = finalAnalytics;
}

export const kLocalStorageDurationKey = "bloom-player-read-duration";
export const kLocalStorageBookUrlKey = "bloom-player-book-url";

// If there is book progress report pending, send it to analytics.
// This happens only if a reader quits part-way through a book.
// This report is hooked to the 'beforeunload' event in hopes that it will get sent before
// the javascript gets unloaded.  However, this is not guaranteed.  I chose 'beforeunload'
// instead of 'unload' in hopes that the few extra milliseconds would increase the chances
// of the tracking message being sent.
function finalAnalytics() {
    const myIter = pendingBookAnalytics.entries();
    let item = myIter.next();
    while (!item.done) {
        const theEvent: string = item.value[0];
        const theParams: any = item.value[1];
        track(theEvent, theParams);
        item = myIter.next();
    }
    pendingBookAnalytics.clear();
    localStorage.removeItem(kLocalStorageDurationKey); // Make sure we don't include this duration for subsequent reads
    return null; // prevent popup verification dialog.
}

export function track(event: string, params: object) {
    // Note that once the script created in the load() function above is loaded,
    // window.analytics is an object defined in that script, not the object
    // we created in the immediately-invoked function above. So don't be tempted
    // to save that object and reuse it here.
    const analytics = (window as any).analytics;
    analytics.track(event, params);
    //console.log("DEBUG track('" + event + "', " + JSON.stringify(params) + ")");
}

const pendingBookAnalytics = new Map<string, object>();
// Per-book gate for "Pages Read"; see "Important notes about analytics/session state and host lifecycle" above.
let allPagesRead: boolean = false;
// If we get to the "last numbered page" in the book, send the tracking report that
// all the pages in the book have been read.  (even though this might be sent before
// the reader has actually read the page in real time...)
// Otherwise, if we haven't yet sent that report, store the information for which
// page has been read so that we can try to send a report if the reader quits part
// way through the book.  (This is not guaranteed to work: see the comment on the
// finalAnalytics method.)
export function updateBookProgress(event: string, params: object) {
    if (event === "Pages Read") {
        // Ensure that the book gets credit for being read all the way through.
        if (!allPagesRead && params["lastNumberedPageRead"]) {
            track(event, params);
            allPagesRead = true;
            pendingBookAnalytics.delete(event);
            localStorage.removeItem(kLocalStorageDurationKey); // Make sure we don't include this duration for subsequent reads
        }
        if (allPagesRead) {
            return;
        }
    }
    pendingBookAnalytics.set(event, params);
}

// We decided, for now, to just send to the production analytics source
// for sites which we don't know that represent real embedding.
// So, our dev site reports to the dev analytics source and localhost reports
// to the test analytics source.
function getEnvironment(): Environment {
    if (
        window.location.hostname === "dev.bloomlibrary.org" ||
        window.location.search.includes("dev.bloomlibrary.org")
    ) {
        return Environment.Dev;
    } else if (
        window.location.hostname === "localhost" ||
        window.location.search.includes("localhost")
    ) {
        return Environment.Test;
    }
    return Environment.Prod; // embedded somewhere else, it's a real site
}

// Each of these are our own hosted version of https://cdn.segment.com/analytics.js/v1/X/analytics.min.js
// where X is the source key.
// Note that a Segment.io "source" is the (intermediate) destination that we send stuff TO.
// Development: vidljptawu, Production: a6nswpue7x, bloomlibrary_test: plYUfYSopTpXkUxNpV58oGwhPNRSyBzo
// See further explanation in the comment in the analytics.load function above.
// Todo: allow user (or developers and testers) to send analytics to dev or test.
function getAnalyticsJsFilePath(): string {
    switch (getEnvironment()) {
        case Environment.Prod:
            return "https://bloomlibrary.org/analytics.min.js";
        case Environment.Dev:
            return "https://bloomlibrary.org/analytics.dev.min.js";
        default:
            return "https://bloomlibrary.org/analytics.test.min.js";
    }
}
