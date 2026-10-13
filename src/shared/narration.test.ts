import { afterEach, describe, expect, test } from "vitest";
import {
    currentAudioUrl,
    getNarrationFileName,
    setCurrentPage,
} from "./narration";

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
