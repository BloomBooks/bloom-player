import { computeBookUrlParts, fullUrl, getBodyAttributes } from "./bookLoader";

describe("computeBookUrlParts", () => {
    it("handles a folder url: book htm named after the folder", () => {
        expect(computeBookUrlParts("http://x.org/books/My Book")).toEqual({
            urlOfBookHtmlFile: "http://x.org/books/My Book/My Book.htm",
            urlPrefix: "http://x.org/books/My Book",
        });
    });

    it("handles a full .htm url: prefix is the containing folder", () => {
        expect(
            computeBookUrlParts("http://x.org/books/My Book/index.htm"),
        ).toEqual({
            urlOfBookHtmlFile: "http://x.org/books/My Book/index.htm",
            urlPrefix: "http://x.org/books/My Book",
        });
    });

    it("handles a %2f-encoded slash before the book name", () => {
        expect(computeBookUrlParts("http://x.org/books%2fMy Book")).toEqual({
            urlOfBookHtmlFile: "http://x.org/books%2fMy Book/My Book.htm",
            // for folder-style urls the whole (still-encoded) url is the prefix
            urlPrefix: "http://x.org/books%2fMy Book",
        });
    });

    it("handles a full .htm url after a %2f-encoded slash", () => {
        expect(
            computeBookUrlParts("http://x.org/stuff%2findex.htm"),
        ).toEqual({
            urlOfBookHtmlFile: "http://x.org/stuff%2findex.htm",
            urlPrefix: "http://x.org/stuff",
        });
    });
});

describe("fullUrl", () => {
    it("prepends the book folder", () => {
        expect(fullUrl("meta.json", "http://x.org/book")).toBe(
            "http://x.org/book/meta.json",
        );
    });
});

describe("getBodyAttributes", () => {
    it("converts body attributes to a plain object", () => {
        const doc = new DOMParser().parseFromString(
            `<html><body class="foo bar" data-bookshelfurlkey="shelf"></body></html>`,
            "text/html",
        );
        expect(getBodyAttributes(doc.body as HTMLBodyElement)).toEqual({
            class: "foo bar",
            "data-bookshelfurlkey": "shelf",
        });
    });
});
