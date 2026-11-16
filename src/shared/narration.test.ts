import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
    currentAudioUrl,
    getNarrationFileName,
    playAllAudio,
    recordHighlightingFixesOn,
    setCurrentPage,
    undoHighlightingFixes,
} from "./narration";

describe("undoing what playing a sentence does to its highlighting", () => {
    // Playing a sentence whose text has a run of three or more spaces splits the text into spans,
    // so that the spaces are not highlighted, and first strips any highlight classes the book had
    // put there itself. A drag activity's page records what each sentence was, so that leaving play
    // mode, or saving a copy of the page during it, can put the book's own markup back.
    const original =
        '<span id="s1" class="audio-sentence">One&nbsp; &nbsp;two <span id="s1a" class="ui-enableHighlight">three</span></span>';

    function makePage() {
        document.body.innerHTML = `<div class="bloom-page"><div class="bloom-editable">${original}</div></div>`;
        return document.querySelector<HTMLElement>(".bloom-page")!;
    }

    function play(page: HTMLElement) {
        playAllAudio([page.querySelector<HTMLElement>("#s1")!], page);
    }

    beforeAll(() => {
        // jsdom has neither innerText nor media playback.
        Object.defineProperty(HTMLElement.prototype, "innerText", {
            configurable: true,
            get() {
                return this.textContent;
            },
        });
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(
            undefined,
        );
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
            () => {},
        );
    });

    afterEach(() => {
        recordHighlightingFixesOn(undefined);
        document.body.innerHTML = "";
    });

    test("puts a copy of the page back as the book had it, and leaves the page alone", () => {
        const page = makePage();
        recordHighlightingFixesOn(page);
        play(page);
        const played = page.querySelector("#s1")!.outerHTML;
        expect(played, "test setup: playing changed the sentence").not.toBe(
            original,
        );

        const copy = page.cloneNode(true) as HTMLElement;
        undoHighlightingFixes(copy);

        expect(copy.querySelector("#s1")!.outerHTML).toBe(original);
        expect(
            page.querySelector("#s1")!.outerHTML,
            "the live page is still playing",
        ).toBe(played);
    });

    test("playing the sentence again does not replace what was recorded", () => {
        const page = makePage();
        recordHighlightingFixesOn(page);
        play(page);
        play(page);

        undoHighlightingFixes(page);

        expect(page.querySelector("#s1")!.outerHTML).toBe(original);
    });

    test("records nothing for a page it was not asked to", () => {
        const page = makePage();
        play(page);
        const played = page.querySelector("#s1")!.outerHTML;

        undoHighlightingFixes(page);

        expect(page.querySelector("#s1")!.outerHTML).toBe(played);
    });
});

describe("getNarrationFileName", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("defaults to <id>.mp3 when no data-audio-src is present", () => {
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence"></span>';
        expect(getNarrationFileName("s1", document.getElementById("s1"))).toBe(
            "s1.mp3",
        );
    });

    test("defaults to <id>.mp3 for a missing element", () => {
        expect(getNarrationFileName("s1", null)).toBe("s1.mp3");
    });

    test("defaults to <id>.mp3 when data-audio-src is empty", () => {
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence" data-audio-src=""></span>';
        expect(getNarrationFileName("s1", document.getElementById("s1"))).toBe(
            "s1.mp3",
        );
    });

    test("uses data-audio-src on the element", () => {
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence" data-audio-src="s1.opus"></span>';
        expect(getNarrationFileName("s1", document.getElementById("s1"))).toBe(
            "s1.opus",
        );
    });

    test("ignores data-audio-src on an ancestor", () => {
        document.body.innerHTML =
            '<div class="bloom-page" data-audio-src="page.opus"><span id="s1" class="audio-sentence"></span></div>';
        expect(getNarrationFileName("s1", document.getElementById("s1"))).toBe(
            "s1.mp3",
        );
    });
});

describe("currentAudioUrl", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    // Neighboring pages stay in the DOM, and two of them can contain the same id.
    function setUpTwoPagesSharingAnId() {
        document.body.innerHTML =
            '<div id="pageA" class="bloom-page"><span id="shared" class="audio-sentence"></span></div>' +
            '<div id="pageB" class="bloom-page"><span id="shared" class="audio-sentence" data-audio-src="shared.opus"></span></div>';
        return {
            pageA: document.getElementById("pageA")!,
            pageB: document.getElementById("pageB")!,
        };
    }

    test("uses the element on the current page when an earlier page reuses the id", () => {
        const { pageB } = setUpTwoPagesSharingAnId();
        setCurrentPage(pageB);
        expect(currentAudioUrl("shared")).toMatch(/\/audio\/shared\.opus$/);
    });

    test("uses the element it is given, wherever it is", () => {
        const { pageA, pageB } = setUpTwoPagesSharingAnId();
        setCurrentPage(pageA);
        const elementOnB = pageB.querySelector("#shared");
        expect(currentAudioUrl("shared", elementOnB)).toMatch(
            /\/audio\/shared\.opus$/,
        );
    });

    test("falls back to <id>.mp3 when the element can't be found", () => {
        const { pageA } = setUpTwoPagesSharingAnId();
        setCurrentPage(pageA);
        expect(currentAudioUrl("missing")).toMatch(/\/audio\/missing\.mp3$/);
    });
});
