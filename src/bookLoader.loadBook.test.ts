import { afterEach, describe, expect, test, vi } from "vitest";
import axios from "axios";
import { loadBook } from "./bookLoader";

vi.mock("axios");

const prefix = "https://example.org/books/MyBook";

// Answers each of loadBook's requests by file name; a missing entry is a 404.
function serve(files: Record<string, unknown>) {
    vi.mocked(axios.get).mockImplementation((url: string) => {
        const name = url.substring(url.lastIndexOf("/") + 1);
        return name in files
            ? Promise.resolve({ data: files[name] })
            : Promise.reject(new Error(`404 ${url}`));
    });
}

const bookFiles = {
    "MyBook.htm": "<html><body><div class='bloom-page'></div></body></html>",
    "meta.json": { title: "My Book" },
};

describe("loadBook's publish settings", () => {
    afterEach(() => {
        vi.mocked(axios.get).mockReset();
    });

    test("returns the audioVideo section of publish-settings.json", async () => {
        serve({
            ...bookFiles,
            "publish-settings.json": {
                audioVideo: { pageTurnDelay: 2500, pauseAfterNarration: 4000 },
                bloomPUB: { motion: true },
            },
        });

        const book = await loadBook(`${prefix}/MyBook.htm`, prefix);

        expect(book.metaDataObject).toEqual({ title: "My Book" });
        expect(book.audioVideoSettings).toEqual({
            pageTurnDelay: 2500,
            pauseAfterNarration: 4000,
        });
    });

    test("a book without publish-settings.json still loads, with no settings", async () => {
        serve(bookFiles);

        const book = await loadBook(`${prefix}/MyBook.htm`, prefix);

        expect(book.metaDataObject).toEqual({ title: "My Book" });
        expect(book.audioVideoSettings).toBeUndefined();
    });
});
