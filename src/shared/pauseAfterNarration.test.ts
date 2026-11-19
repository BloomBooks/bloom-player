import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    abortNarrationPlayback,
    computeDuration,
    hidingPage,
    PageNarrationComplete,
    pauseNarration,
    playAllSentences,
    playNarration,
    setDurationOfPagesWithoutNarration,
    setPauseAfterNarration,
} from "./narration";

// A page with one narrated sentence lasting two seconds.
function makeNarratedPage(): HTMLElement {
    document.body.innerHTML =
        '<div class="bloom-page" id="page1"><div class="bloom-editable bloom-visibility-code-on" lang="en">' +
        '<p><span id="s1" class="audio-sentence" data-duration="2.0">Hello.</span></p>' +
        "</div></div>";
    return document.getElementById("page1")!;
}

// Simulates the browser's audio player reaching the end of the current recording.
function finishPlayingTheRecording() {
    const player = document.getElementById("bloom-audio-player");
    if (!player) {
        throw new Error(
            "playAllSentences should have created the audio player",
        );
    }
    player.dispatchEvent(new Event("ended"));
}

describe("pauseAfterNarration", () => {
    let completedPages: HTMLElement[];
    const recordCompletion = (page: HTMLElement | undefined) =>
        completedPages.push(page!);

    beforeEach(() => {
        vi.useFakeTimers();
        completedPages = [];
        PageNarrationComplete.subscribe(recordCompletion);
    });

    afterEach(() => {
        PageNarrationComplete.unsubscribe(recordCompletion);
        hidingPage();
        setPauseAfterNarration(0);
        setDurationOfPagesWithoutNarration(3.0);
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    test("with no pause, the page is complete as soon as the narration ends", () => {
        const page = makeNarratedPage();
        playAllSentences(page);
        expect(completedPages).toEqual([]);

        finishPlayingTheRecording();

        expect(completedPages).toEqual([page]);
    });

    test("the page is complete only after the pause", () => {
        setPauseAfterNarration(4);
        const page = makeNarratedPage();
        playAllSentences(page);

        finishPlayingTheRecording();
        expect(completedPages).toEqual([]);
        vi.advanceTimersByTime(3900);
        expect(completedPages).toEqual([]);

        vi.advanceTimersByTime(200);

        expect(completedPages).toEqual([page]);
    });

    test("pausing during the pause holds the page; resuming completes it at once", () => {
        setPauseAfterNarration(4);
        const page = makeNarratedPage();
        playAllSentences(page);
        finishPlayingTheRecording();

        pauseNarration();
        vi.advanceTimersByTime(10000);
        expect(completedPages).toEqual([]);

        playNarration();

        expect(completedPages).toEqual([page]);
        vi.advanceTimersByTime(10000);
        expect(completedPages).toEqual([page]);
    });

    test("leaving the page during the pause cancels it", () => {
        setPauseAfterNarration(4);
        const page = makeNarratedPage();
        playAllSentences(page);
        finishPlayingTheRecording();

        hidingPage();
        abortNarrationPlayback();
        vi.advanceTimersByTime(10000);

        expect(completedPages).toEqual([]);
    });

    test("starting new audio on the same page during the pause cancels it", () => {
        // What a game page does when the reader taps another item during the pause.
        setPauseAfterNarration(4);
        const page = makeNarratedPage();
        playAllSentences(page);
        finishPlayingTheRecording();
        expect(completedPages).toEqual([]);

        playAllSentences(page);
        vi.advanceTimersByTime(10000);
        expect(completedPages).toEqual([]);

        finishPlayingTheRecording();
        vi.advanceTimersByTime(4100);

        expect(completedPages).toEqual([page]);
    });

    test("aborting during the pause completes the page at once", () => {
        setPauseAfterNarration(4);
        const page = makeNarratedPage();
        playAllSentences(page);
        finishPlayingTheRecording();
        vi.advanceTimersByTime(1000);
        expect(completedPages).toEqual([]);

        abortNarrationPlayback();

        expect(completedPages).toEqual([page]);
        vi.advanceTimersByTime(10000);
        expect(completedPages).toEqual([page]);
    });

    test("aborting the narration completes the page without a pause", () => {
        setPauseAfterNarration(4);
        const page = makeNarratedPage();
        playAllSentences(page);

        abortNarrationPlayback();

        expect(completedPages).toEqual([page]);
    });

    test("computeDuration adds the pause to a narrated page", () => {
        const page = makeNarratedPage();
        setDurationOfPagesWithoutNarration(1);
        expect(computeDuration(page)).toBe(2);

        setPauseAfterNarration(4);

        expect(computeDuration(page)).toBe(6);
    });

    test("computeDuration does not add the pause to a page without narration", () => {
        document.body.innerHTML = '<div class="bloom-page" id="page1"></div>';
        setDurationOfPagesWithoutNarration(3);
        setPauseAfterNarration(4);

        expect(computeDuration(document.getElementById("page1")!)).toBe(3);
    });
});

// The wait on a page without narration shares its mechanism with the pause after narration.
describe("a page without narration", () => {
    let completedPages: HTMLElement[];
    const recordCompletion = (page: HTMLElement | undefined) =>
        completedPages.push(page!);

    function makePageWithoutNarration(): HTMLElement {
        document.body.innerHTML =
            '<div class="bloom-page" id="page1"><div class="bloom-editable bloom-visibility-code-on" lang="en">' +
            "<p>No recording here.</p></div></div>";
        return document.getElementById("page1")!;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        completedPages = [];
        setDurationOfPagesWithoutNarration(3);
        PageNarrationComplete.subscribe(recordCompletion);
    });

    afterEach(() => {
        PageNarrationComplete.unsubscribe(recordCompletion);
        hidingPage();
        setDurationOfPagesWithoutNarration(3.0);
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    test("completes only after its usual delay", () => {
        const page = makePageWithoutNarration();
        playAllSentences(page);
        vi.advanceTimersByTime(2900);
        expect(completedPages).toEqual([]);

        vi.advanceTimersByTime(200);

        expect(completedPages).toEqual([page]);
    });

    test("pausing during the delay holds the page; resuming completes it at once, once", () => {
        const page = makePageWithoutNarration();
        playAllSentences(page);
        vi.advanceTimersByTime(1000);

        pauseNarration();
        vi.advanceTimersByTime(10000);
        expect(completedPages).toEqual([]);

        playNarration();

        expect(completedPages).toEqual([page]);
        vi.advanceTimersByTime(10000);
        expect(completedPages).toEqual([page]);
    });
});
