import { BloomPlayerCore } from "./bloom-player-core";
import { storePageDataExternally, reportAnalytics } from "./externalContext";
import { TransientPageDataSingleton } from "./transientPageData";

/* This API is for use by interactive pages */

/*
    Interactive pages call this in order to 
    1) update the score that someday we may display on each page, and ( <---- Not implemented yet )
    2) optionally contribute to one analytics score. The category/label for that analytics has to be
    given to this twice: first in a data-analyticsCategories attribute on the page, and secondly in the
    call. The attribute is used to identify all the pages which are expected to contribute to
    this analytics score; it will be sent when all of them have (see below).

    Notes:
    * Pages can call this as many times as they want (e.g. after every click if that makes sense); this will
        take care of replacing the old score with the new.
    * .... Except, only the first call for a page counts for analytics. The thinking here is that currently,
    * we are only using analytics for comprehension, and there, it doesn't make sense to let the user try
    * over and over. However, it might well make sense to update the score they see on screen. If ever we
    * have some analytics scale that *does* make sense to be updatable, e.g. a "Please rate this book", then
    * we can always add a new parameter to this method to control that.
    * 
    * We don't currently (May 2019) have a way to tell the page "this is your last chance to report a score".
    * Rather, we send the analytics immediately when every page that has this analyticsCategory (in its
    * data-analyticsCategories list) has reported at least once.
    * The category "comprehension" is special. For backwards compatibility with an old implementation
    * of comprehension questions, both the event name and parameters of the event are modified (at least
    * by bloom-reader2; not here).
*/
export function reportScoreForCurrentPage(
    possiblePoints: number,
    actualPoints: number,
    analyticsCategory: string
): void {
    if (!BloomPlayerCore.getCurrentPage()) {
        alert("null currentPage in reportScoreForCurrentPage()");
        return;
    }
    if (
        !analyticsCategory ||
        !doesPageHaveAnalyticsCategory(
            BloomPlayerCore.getCurrentPage(),
            analyticsCategory
        )
    ) {
        alert("inconsistent analyticsCategory in reportScoreForCurrentPage()");
    }

    if (getPageData(BloomPlayerCore.getCurrentPage(), analyticsCategory)) {
        // not the first time called for this page.
        // Eventually we might store it under another key for purposes of tracking
        return;
    }
    storePageData(
        BloomPlayerCore.getCurrentPage(),
        analyticsCategory,
        JSON.stringify({ possiblePoints, actualPoints, analyticsCategory })
    );

    // See if we now have a score from all pages of this analyticsCategory.
    // Note that if we've already sent this to analytics, it's not possible to get to this point, so we
    // won't be reporting it more than once.
    const pages = Array.from(
        document.getElementsByClassName("bloom-interactive-page")
    ).filter(p => doesPageHaveAnalyticsCategory(p, analyticsCategory));
    let totalPossiblePoints = 0;
    let totalActualPoints = 0;
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const scoreObjectString = getPageData(page, analyticsCategory);
        if (!scoreObjectString) {
            return; // don't have all the results yet, wait for more
        }
        const score = JSON.parse(scoreObjectString);

        totalPossiblePoints += score.possiblePoints;
        totalActualPoints += score.actualPoints;
    }
    // We didn't return in the middle of that last loop, so we found a score for every page with the same analytics key.
    // Time to actually send the report!
    const params = {
        possiblePoints: totalPossiblePoints,
        actualPoints: totalActualPoints,
        percentRight: (totalActualPoints * 100) / totalPossiblePoints
    };
    reportAnalytics(analyticsCategory, params);
}

// A page should call this with any state it needs to reconstitute the page.
// Note that on in Bloom Reader Android, at least, this is needed even to preserve the
// state when the user rotates the device.
export function storePageData(page: Element, key: string, value: string): void {
    const fullKey = getFullDataKey(page, key);
    // Store so that a getPageData() will return this value (even if no parent window implements saving)
    TransientPageDataSingleton.getData()[fullKey] = value;

    // Next, hand this key/value pair to our parent so that if/when this instance of the player
    // disappears, the parent can give it back to us. In other words, make this value available
    // to the player the next time this book is shown on this device.

    // If the player is just in an iframe somewhere, nothing is going to receive this message,
    // and that is fine. The book just can't store state across runs in that environment. We
    // ruled out using window.localStorage because that is tied to the domain, and the lifetime
    // just unwieldy (not private to this book, for example) and it doesn't seem necessary anyhow
    // at this point.

    // If instead the player is being hosted by something smart like the Bloom Reader, it can
    // receive this and persist it in a way that lets it (the reader) control the lifetime, e.g.
    // the reader would need to know to delete this storage if we get a new version of the book.
    // Or the reader might have a way (e.g. a setting) that controls whether it should persist
    // book state across uses of the book (e.g. in a highly-shared device scenario, there might
    // be a setting to never persist once you leave the book or quit the app.)
    storePageDataExternally(fullKey, value);
}

// A page should call this to recover any state it needs to reconstitute the page.
export function getPageData(page: Element, key: string): string {
    return TransientPageDataSingleton.getData()[getFullDataKey(page, key)];
}

function doesPageHaveAnalyticsCategory(
    page: Element,
    analyticsCategory: string
) {
    return (
        (page.getAttribute("data-analyticsCategories") || "")
            .split(" ")
            .indexOf(analyticsCategory) >= 0
    );
}

function getFullDataKey(page: Element, key: string): string {
    return "p" + getIndexOfPage(page) + "." + key;
}

function getIndexOfPage(page: Element): string {
    const slider = page.closest(".slick-slide");
    if (!slider) {
        alert("page not embedded as expected");
        return "";
    }
    return slider.getAttribute("data-index") || "";
}
