import { beforeEach, describe, expect, test, vi } from "vitest";

// Each test gets a fresh copy of narration.ts, because which durations the host has set is
// remembered for the life of the module.
async function freshNarration() {
    vi.resetModules();
    return await import("./narration");
}

function pageWithoutNarration(): HTMLElement {
    document.body.innerHTML = '<div class="bloom-page" id="silent"></div>';
    return document.getElementById("silent")!;
}

// A page whose narration lasts two seconds.
function narratedPage(): HTMLElement {
    document.body.innerHTML =
        '<div class="bloom-page" id="narrated"><div class="bloom-editable bloom-visibility-code-on" lang="en">' +
        '<p><span id="s1" class="audio-sentence" data-duration="2.0">Hello.</span></p>' +
        "</div></div>";
    return document.getElementById("narrated")!;
}

// computeDuration is how long the page stays up in autoplay, so it shows which durations apply:
// a page without narration lasts durationOfPagesWithoutNarration, and a narrated page lasts its
// narration plus pauseAfterNarration.
describe("a book's own Audio/Video publish settings", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    test("apply when the host doesn't set the durations", async () => {
        const narration = await freshNarration();
        expect(narration.computeDuration(pageWithoutNarration())).toBe(3);

        narration.applyBookPublishSettings({
            pageTurnDelay: 2500,
            pauseAfterNarration: 1500,
        });

        expect(narration.computeDuration(pageWithoutNarration())).toBe(2.5);
        expect(narration.computeDuration(narratedPage())).toBe(3.5);
    });

    test("don't override durations the host set", async () => {
        const narration = await freshNarration();
        narration.setDurationOfPagesWithoutNarration(0);
        narration.setPauseAfterNarration(4);

        narration.applyBookPublishSettings({
            pageTurnDelay: 5000,
            pauseAfterNarration: 1500,
        });

        expect(narration.computeDuration(pageWithoutNarration())).toBe(0);
        expect(narration.computeDuration(narratedPage())).toBe(6);
    });

    test("a book without settings gets the defaults, not the previous book's", async () => {
        const narration = await freshNarration();
        narration.applyBookPublishSettings({
            pageTurnDelay: 5000,
            pauseAfterNarration: 1500,
        });
        expect(narration.computeDuration(pageWithoutNarration())).toBe(5);

        narration.applyBookPublishSettings(undefined);

        expect(narration.computeDuration(pageWithoutNarration())).toBe(3);
        expect(narration.computeDuration(narratedPage())).toBe(3);
    });

    test("a book saved before the pause existed gets no pause", async () => {
        const narration = await freshNarration();

        narration.applyBookPublishSettings({ pageTurnDelay: 4000 });

        expect(narration.computeDuration(pageWithoutNarration())).toBe(4);
        expect(narration.computeDuration(narratedPage())).toBe(4);
    });
});
