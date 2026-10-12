import { afterEach, describe, expect, test } from "vitest";
import { getNarrationFileExtension } from "./narration";

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
