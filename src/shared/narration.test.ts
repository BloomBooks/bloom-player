import { afterEach, describe, expect, test } from "vitest";
import {
    currentAudioUrl,
    getNarrationFileExtension,
    setCurrentPage,
} from "./narration";

describe("getNarrationFileExtension", () => {
    afterEach(() => {
        document.body.removeAttribute("data-audio-ext");
        document.body.innerHTML = "";
    });

    test("defaults to mp3 when no data-audio-ext is present", () => {
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence"></span>';
        expect(getNarrationFileExtension(document.getElementById("s1"))).toBe(
            "mp3",
        );
    });

    test("defaults to mp3 for a missing element", () => {
        expect(getNarrationFileExtension(null)).toBe("mp3");
    });

    test("uses data-audio-ext on the element itself", () => {
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence" data-audio-ext="opus"></span>';
        expect(getNarrationFileExtension(document.getElementById("s1"))).toBe(
            "opus",
        );
    });

    test("inherits data-audio-ext from an ancestor", () => {
        document.body.setAttribute("data-audio-ext", "opus");
        document.body.innerHTML =
            '<div class="bloom-page"><span id="s1" class="audio-sentence"></span></div>';
        expect(getNarrationFileExtension(document.getElementById("s1"))).toBe(
            "opus",
        );
    });

    test("the nearest data-audio-ext wins", () => {
        document.body.setAttribute("data-audio-ext", "opus");
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence" data-audio-ext="mp3"></span>';
        expect(getNarrationFileExtension(document.getElementById("s1"))).toBe(
            "mp3",
        );
    });

    test("normalizes a leading dot and uppercase", () => {
        document.body.innerHTML =
            '<span id="s1" class="audio-sentence" data-audio-ext=".OPUS"></span>';
        expect(getNarrationFileExtension(document.getElementById("s1"))).toBe(
            "opus",
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
            '<div id="pageB" class="bloom-page" data-audio-ext="opus"><span id="shared" class="audio-sentence"></span></div>';
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

    test("falls back to mp3 when the element can't be found", () => {
        const { pageA } = setUpTwoPagesSharingAnId();
        setCurrentPage(pageA);
        expect(currentAudioUrl("missing")).toMatch(/\/audio\/missing\.mp3$/);
    });
});
