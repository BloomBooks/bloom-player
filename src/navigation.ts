const jumpHistory: { bookId: string; pageId: string }[] = [];

export function checkClickForBookOrPageJump(
    event: any,
    currentBookInstanceId: string,
    currentPageId: string,
): {
    newBookUrl?: string;
    newPageId?: string;
} {
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

    if (targetBookId) {
        jumpHistory.push({
            bookId: currentBookInstanceId,
            pageId: currentPageId,
        });
        return {
            newBookUrl: `/book/${targetBookId}/index.htm`,
            newPageId: targetPageId,
        };
    }
    // not changing books, just pages
    if (targetPageId) {
        jumpHistory.push({
            bookId: currentBookInstanceId,
            pageId: currentPageId,
        });
        return { newPageId: targetPageId };
    }

    return {}; // nothing to do as far as navigation goes
}

function parseTargetBookUrl(url: string) {
    // the format is "/book/BOOKID#PAGEID" where the page id is optional
    const bloomUrl = new URL(url, window.location.origin);
    const bookId = bloomUrl.pathname.replace("/book/", "");
    const pageId = bloomUrl.hash.replace("#", "");
    return { bookId, pageId };
}
