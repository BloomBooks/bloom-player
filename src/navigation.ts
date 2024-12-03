const jumpHistory: { bookId: string; pageId: string }[] = [];

type ILocation = { bookUrl?: string; pageId?: string };

export function canGoBack() {
    return jumpHistory.length > 0;
}
export function checkForBackLocation(
    currentBookId: string,
): ILocation | undefined {
    const previousLocation = jumpHistory.pop();
    if (previousLocation) {
        console.log(
            "Going Back. Current History is: ",
            JSON.stringify(jumpHistory, null, 2),
        );
        return {
            bookUrl:
                currentBookId === previousLocation.bookId
                    ? undefined // we don't want to switch books, just pages
                    : urlFromBookId(previousLocation.bookId),
            pageId: previousLocation.pageId,
        };
    }
    return undefined;
}
function urlFromBookId(bookId: string) {
    return `/book/${bookId}/index.htm`;
}
export function checkClickForBookOrPageJump(
    event: any,
    currentBookInstanceId: string,
    getCurentPageId: () => string,
): ILocation {
    const linkElement = (event.target as HTMLElement).closest(
        "[href], [data-href]",
    );
    if (!linkElement) return {};
    event.preventDefault(); // don't let a link click become a drag
    event.stopPropagation();

    const href: string =
        linkElement.attributes["href"].nodeValue ||
        linkElement.attributes["data-href"];

    if (href.startsWith("http://") || href.startsWith("https://")) {
        // This is a generic external link. We open it in a new window or tab.
        // (The host possibly could intercept this and open a browser to handle it.)
        window.open(href, "_blank", "noreferrer");
        return {};
    }

    let targetBookId: string | undefined = undefined;
    let targetPageId: string | undefined = undefined;

    if (href === "back") {
        const previousLocation = jumpHistory.pop();
        if (previousLocation) {
            targetBookId = previousLocation.bookId;
            targetPageId = previousLocation.pageId;
        }
    } else if (href.startsWith("/book/")) {
        const target = parseTargetBookUrl(href);
        targetBookId = target.bookId;
        targetPageId = target.pageId;

        if (target.bookId === currentBookInstanceId) {
            // link within this book, we can forget the book and just use the page
            targetBookId = undefined;
        }
    } else if (href.startsWith("#")) {
        targetPageId = href.substring(1);
    }
    const currentPageId = getCurentPageId();
    if (targetBookId) {
        pushLocation(currentBookInstanceId, currentPageId, "Changing books");
        return {
            bookUrl: urlFromBookId(targetBookId),
            pageId: targetPageId,
        };
    } else if (targetPageId) {
        // not changing books, just pages
        pushLocation(currentBookInstanceId, currentPageId, "Changing pages");

        return { pageId: targetPageId };
    }

    return {}; // nothing to do as far as navigation goes
}

function pushLocation(bookId: string, pageId: string, comment: string) {
    jumpHistory.push({ bookId, pageId });
    console.log(
        comment + " Current History is: ",
        JSON.stringify(jumpHistory, null, 2),
    );
}
function parseTargetBookUrl(url: string) {
    // the format is "/book/BOOKID#PAGEID" where the page id is optional
    const bloomUrl = new URL(url, window.location.origin);
    const bookId = bloomUrl.pathname.replace("/book/", "");
    const pageId = bloomUrl.hash.replace("#", "");
    return { bookId, pageId };
}
