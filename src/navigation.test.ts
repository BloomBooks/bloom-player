import { describe, test, expect, beforeEach, vi } from "vitest";
import {
    canGoBack,
    goBackInHistoryIfPossible,
    checkClickForBookOrPageJump,
} from "./navigation";

describe("Navigation functions", () => {
    beforeEach(() => {
        // Clear navigation history before each test
        while (canGoBack()) {
            goBackInHistoryIfPossible("dummy");
        }
    });

    describe("canGoBack", () => {
        test("returns false when history is empty", () => {
            expect(canGoBack()).toBe(false);
        });

        test("returns true after navigation", () => {
            const event = createClickEvent("#page2");
            checkClickForBookOrPageJump(event, "book1", () => "page1");
            expect(canGoBack()).toBe(true);
        });
    });

    describe("goBackInHistoryIfPossible", () => {
        test("returns undefined when no history", () => {
            expect(goBackInHistoryIfPossible("book1")).toBeUndefined();
        });

        test("returns previous location after navigation", () => {
            const event = createClickEvent("#page2");
            checkClickForBookOrPageJump(event, "book1", () => "page1");

            const result = goBackInHistoryIfPossible("book1");
            expect(result).toEqual({
                bookUrl: undefined,
                pageId: "page1",
            });
        });
    });

    describe("checkClickForBookOrPageJump", () => {
        test("gives only a pageID (no bookID) when navigation is internal", () => {
            const event = createClickEvent("#page2");
            const result = checkClickForBookOrPageJump(
                event,
                "book1",
                () => "page1",
            );
            expect(result).toEqual({ pageId: "page2" });
        });

        test("gives both bookId and pageId if navigation is between books and specifies a target page", () => {
            const event = createClickEvent("/book/book2#page1");
            const result = checkClickForBookOrPageJump(
                event,
                "book1",
                () => "somePage",
            );
            expect(result).toEqual({
                bookUrl: "/book/book2/index.htm",
                pageId: "page1",
            });
        });

        test('an href of "back" causes navigation up the stack', () => {
            // First navigate to create history
            const event1 = createClickEvent("#page2");
            checkClickForBookOrPageJump(event1, "book1", () => "page1");

            // Then try to go back
            const backEvent = createClickEvent("back");
            const result = checkClickForBookOrPageJump(
                backEvent,
                "book1",
                () => "page2",
            );
            expect(result).toEqual({
                bookUrl: undefined,
                pageId: "page1",
            });
        });

        test("handles external links", () => {
            const windowSpy = vi
                .spyOn(window, "open")
                .mockImplementation(() => null);
            const event = createClickEvent("https://example.com");
            const result = checkClickForBookOrPageJump(
                event,
                "doesn't matter",
                () => "doesn't matter",
            );

            expect(result).toEqual({});
            expect(windowSpy).toHaveBeenCalledWith(
                "https://example.com",
                "_blank",
                "noreferrer",
            );
            windowSpy.mockRestore();
        });

        test("supports multiple back navigation steps", () => {
            // First navigate within book
            const internalEvent = createClickEvent("#page2");
            checkClickForBookOrPageJump(internalEvent, "book1", () => "page1");

            // Then navigate to different book
            const externalEvent = createClickEvent("/book/book2#page3");
            checkClickForBookOrPageJump(externalEvent, "book1", () => "page2");

            // First back navigation should return to page2 in book1
            const firstBack = goBackInHistoryIfPossible("book2");
            expect(firstBack).toEqual({
                bookUrl: "/book/book1/index.htm",
                pageId: "page2",
            });

            // Second back navigation should return to page2 in book1
            const secondBack = goBackInHistoryIfPossible("book1");
            expect(secondBack).toEqual({
                // because the target is in the current book, we don't emit a url
                bookUrl: undefined,
                pageId: "page1",
            });

            // Third back navigation should return undefined (no more history)
            const thirdBack = goBackInHistoryIfPossible("book1");
            expect(thirdBack).toBeUndefined();
        });

        test("doesn't die if an href is empty", () => {
            const event = createClickEvent("");
            const result = checkClickForBookOrPageJump(
                event,
                "doesn't matter",
                () => "doesn't matter",
            );
            expect(result).toEqual(undefined);
        });
    });
});

// Helper function to create mock click events
function createClickEvent(href: string) {
    const mockElement = {
        attributes: {
            href: { nodeValue: href },
        },
        closest: () => mockElement,
    };

    return {
        target: mockElement,
        preventDefault: () => {},
        stopPropagation: () => {},
    };
}
