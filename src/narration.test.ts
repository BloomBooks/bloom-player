import {
    hidingPage,
    playAllVideo,
    showVideoFirstFrameWhenReady,
    sortAudioElements,
} from "./shared/narration";
import { createDiv, createPara, createSpan } from "./test/testHelper";

test("showVideoFirstFrameWhenReady clears autoplay hint before retrying play", () => {
    const container = document.createElement("div");
    container.classList.add("bloom-videoContainer", "autoplayBlocked");
    const video = document.createElement("video");
    container.appendChild(video);
    document.body.appendChild(container);

    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, "play", { value: play });
    Object.defineProperty(video, "readyState", {
        value: HTMLMediaElement.HAVE_CURRENT_DATA,
        configurable: true,
    });

    showVideoFirstFrameWhenReady(video);

    expect(play).toHaveBeenCalledTimes(1);
    expect(container.classList.contains("autoplayBlocked")).toBe(false);
});

// BL-16146: iOS Safari neither preloads video data (so loadeddata may never
// fire) nor allows gestureless unmuted play(). The primer must play muted
// right away - play() itself is what makes iOS load the data - then pause,
// unmute, and drop the transparent poster once a frame has been painted.
test("showVideoFirstFrameWhenReady primes muted without waiting for data, then pauses, unmutes, and removes the poster", async () => {
    const video = document.createElement("video");
    video.setAttribute("poster", "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=");
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    Object.defineProperty(video, "play", { value: play });
    Object.defineProperty(video, "pause", { value: pause });
    // No data loaded at all; the old implementation would have waited for
    // loadeddata and done nothing here.
    Object.defineProperty(video, "readyState", {
        value: HTMLMediaElement.HAVE_NOTHING,
        configurable: true,
    });

    showVideoFirstFrameWhenReady(video);

    expect(play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);

    video.dispatchEvent(new Event("playing"));
    // jsdom has no requestVideoFrameCallback, so the 4ms fallback applies.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
    expect(video.hasAttribute("poster")).toBe(false);
});

test("starting real playback cancels an in-progress priming attempt", async () => {
    const video = document.createElement("video");
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    Object.defineProperty(video, "play", { value: play });
    Object.defineProperty(video, "pause", { value: pause });

    showVideoFirstFrameWhenReady(video);
    expect(video.muted).toBe(true);

    // Real playback of the same video (e.g. Show Correct) must cancel the
    // primer so it can't mute or pause it.
    playAllVideo([video], () => {});
    expect(video.muted).toBe(false);

    video.dispatchEvent(new Event("playing"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pause).not.toHaveBeenCalled();
});

test("re-priming a video cancels the earlier attempt instead of stacking", () => {
    const video = document.createElement("video");
    const play = vi.fn(() => new Promise<void>(() => {}));
    Object.defineProperty(video, "play", { value: play });
    Object.defineProperty(video, "pause", { value: vi.fn() });

    // Two priming attempts on the same (still paused, per jsdom) video, as
    // when a page is left and re-entered within the give-up window.
    showVideoFirstFrameWhenReady(video);
    expect(video.muted).toBe(true);
    showVideoFirstFrameWhenReady(video);
    expect(video.muted).toBe(true);

    // Cancelling must restore the video's ORIGINAL muted state (false), not
    // the first attempt's muting, and must not be orphaned by the first
    // attempt's cleanup.
    playAllVideo([video], () => {});
    expect(video.muted).toBe(false);
});

test("showVideoFirstFrameWhenReady gives up after a timeout, unmuting and removing the poster", () => {
    vi.useFakeTimers();
    try {
        const video = document.createElement("video");
        video.setAttribute("poster", "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=");
        // play() never settles and playing never fires, as when the data
        // never arrives.
        const play = vi.fn(() => new Promise<void>(() => {}));
        Object.defineProperty(video, "play", { value: play });
        Object.defineProperty(video, "pause", { value: vi.fn() });

        showVideoFirstFrameWhenReady(video);
        expect(video.muted).toBe(true);
        expect(video.hasAttribute("poster")).toBe(true);

        vi.advanceTimersByTime(3100);

        expect(video.muted).toBe(false);
        expect(video.hasAttribute("poster")).toBe(false);
    } finally {
        vi.useRealTimers();
    }
});

test("hidingPage stops shared sequential video playback", async () => {
    const firstVideo = document.createElement("video");
    const secondVideo = document.createElement("video");
    const firstPlay = vi.fn(() => Promise.resolve());
    const secondPlay = vi.fn(() => Promise.resolve());
    const firstPause = vi.fn();
    const secondPause = vi.fn();
    const then = vi.fn();

    Object.defineProperty(firstVideo, "play", { value: firstPlay });
    Object.defineProperty(secondVideo, "play", { value: secondPlay });
    Object.defineProperty(firstVideo, "pause", { value: firstPause });
    Object.defineProperty(secondVideo, "pause", { value: secondPause });

    playAllVideo([firstVideo, secondVideo], then);
    await Promise.resolve();

    expect(firstPlay).toHaveBeenCalledTimes(1);

    hidingPage();

    expect(firstPause).toHaveBeenCalledTimes(1);
    expect(firstVideo.currentTime).toBe(0);

    firstVideo.dispatchEvent(new Event("ended"));
    await Promise.resolve();

    expect(secondPlay).not.toHaveBeenCalled();
    expect(then).not.toHaveBeenCalled();
});

test("playAllVideo retries transient failures and succeeds without showing an error", async () => {
    vi.useFakeTimers();
    try {
        const container = document.createElement("div");
        const video = document.createElement("video");
        container.appendChild(video);
        document.body.appendChild(container);

        const play = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce({ name: "AbortError" })
            .mockRejectedValueOnce({
                message:
                    "The play() request was interrupted by a call to pause().",
            })
            .mockResolvedValue(undefined);

        Object.defineProperty(video, "play", { value: play });

        const then = vi.fn();
        playAllVideo([video], then);

        await Promise.resolve();
        expect(play).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(50);
        expect(play).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(50);
        expect(play).toHaveBeenCalledTimes(3);

        video.dispatchEvent(new Event("ended"));
        await Promise.resolve();

        expect(then).toHaveBeenCalledTimes(1);
        expect(
            container.getElementsByClassName("video-error-message").length,
        ).toBe(0);
    } finally {
        vi.useRealTimers();
    }
});

test("playAllVideo shows an error after transient retries are exhausted and continues", async () => {
    vi.useFakeTimers();
    try {
        const firstContainer = document.createElement("div");
        const firstVideo = document.createElement("video");
        firstContainer.appendChild(firstVideo);
        document.body.appendChild(firstContainer);

        const secondContainer = document.createElement("div");
        const secondVideo = document.createElement("video");
        secondContainer.appendChild(secondVideo);
        document.body.appendChild(secondContainer);

        const firstPlay = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce({ name: "AbortError" })
            .mockRejectedValueOnce({ name: "AbortError" })
            .mockRejectedValueOnce({ name: "AbortError" });
        const secondPlay = vi.fn(() => Promise.resolve());

        Object.defineProperty(firstVideo, "play", { value: firstPlay });
        Object.defineProperty(secondVideo, "play", { value: secondPlay });

        const then = vi.fn();
        playAllVideo([firstVideo, secondVideo], then);

        await Promise.resolve();
        expect(firstPlay).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(50);
        expect(firstPlay).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(50);
        expect(firstPlay).toHaveBeenCalledTimes(3);
        expect(secondPlay).toHaveBeenCalledTimes(1);
        expect(
            firstContainer.getElementsByClassName("video-error-message").length,
        ).toBe(1);

        secondVideo.dispatchEvent(new Event("ended"));
        await Promise.resolve();

        expect(then).toHaveBeenCalledTimes(1);
    } finally {
        vi.useRealTimers();
    }
});

test("playAllVideo still advances when ended fires before play promise resolves", async () => {
    let resolveFirstPlay: (() => void) | undefined;
    const firstPlayPromise = new Promise<void>((resolve) => {
        resolveFirstPlay = resolve;
    });

    const firstVideo = document.createElement("video");
    const secondVideo = document.createElement("video");
    const firstPlay = vi.fn(() => firstPlayPromise);
    const secondPlay = vi.fn(() => Promise.resolve());
    const then = vi.fn();

    Object.defineProperty(firstVideo, "play", { value: firstPlay });
    Object.defineProperty(secondVideo, "play", { value: secondPlay });

    playAllVideo([firstVideo, secondVideo], then);

    // Simulate an early ended signal that can happen before the play() promise settles.
    firstVideo.dispatchEvent(new Event("ended"));
    resolveFirstPlay?.();
    await Promise.resolve();

    expect(secondPlay).toHaveBeenCalledTimes(1);

    secondVideo.dispatchEvent(new Event("ended"));
    await Promise.resolve();

    expect(then).toHaveBeenCalledTimes(1);
});

test("playAllVideo advances when video pauses at end without ended", async () => {
    const firstVideo = document.createElement("video");
    const secondVideo = document.createElement("video");
    const firstPlay = vi.fn(() => Promise.resolve());
    const secondPlay = vi.fn(() => Promise.resolve());
    const then = vi.fn();

    Object.defineProperty(firstVideo, "play", { value: firstPlay });
    Object.defineProperty(secondVideo, "play", { value: secondPlay });

    Object.defineProperty(firstVideo, "duration", {
        value: 1,
        configurable: true,
    });

    playAllVideo([firstVideo, secondVideo], then);
    await Promise.resolve();

    // Simulate environments where end-of-stream results in pause without ended.
    firstVideo.currentTime = 0.98;
    firstVideo.dispatchEvent(new Event("pause"));
    await Promise.resolve();

    expect(secondPlay).toHaveBeenCalledTimes(1);

    secondVideo.dispatchEvent(new Event("ended"));
    await Promise.resolve();

    expect(then).toHaveBeenCalledTimes(1);
});

test("playAllVideo advances when duration elapses without ended or pause", async () => {
    vi.useFakeTimers();
    try {
        const firstVideo = document.createElement("video");
        const secondVideo = document.createElement("video");
        const firstPlay = vi.fn(() => Promise.resolve());
        const secondPlay = vi.fn(() => Promise.resolve());
        const then = vi.fn();

        Object.defineProperty(firstVideo, "play", { value: firstPlay });
        Object.defineProperty(secondVideo, "play", { value: secondPlay });
        Object.defineProperty(firstVideo, "duration", {
            value: 0.1,
            configurable: true,
        });

        playAllVideo([firstVideo, secondVideo], then);
        await Promise.resolve();

        // No ended/pause event: watchdog should advance after duration + grace.
        await vi.advanceTimersByTimeAsync(400);
        expect(secondPlay).toHaveBeenCalledTimes(1);

        secondVideo.dispatchEvent(new Event("ended"));
        await Promise.resolve();

        expect(then).toHaveBeenCalledTimes(1);
    } finally {
        vi.useRealTimers();
    }
});

test("sortAudioElements with no tabindexes preserves order", () => {
    const input = document.createElement("div");
    const tg1 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        parent: input,
    });
    const be1A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The first block</p>",
        tabindex: "3", // should be ignored
        parent: tg1,
    });

    const tg2 = createDiv({
        id: "tg2",
        classAttr: "bloom-translationGroup",
        parent: input,
    });
    const be2A = createDiv({
        id: "be2A",
        classAttr: "bloom-editable",
        tabindex: "1", // should be ignored
        parent: tg2,
    });
    const p2A1 = createPara({ id: "p2A1", classAttr: "", parent: be2A });
    const s2A1A = createSpan({
        id: "s2A1A",
        classAttr: "audio-sentence",
        content: "The first sentence in the second group",
        parent: p2A1,
    });
    const s2A1B = createSpan({
        id: "s2A1B",
        classAttr: "audio-sentence",
        content: "The second sentence in the second group",
        parent: p2A1,
    });

    const tg3 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        content: "",
        parent: input,
    });
    const be3A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The third block</p>",
        tabindex: "0", // should be ignored
        parent: tg3,
    });

    const toSort = [be1A, s2A1A, s2A1B, be3A];
    const output = sortAudioElements(toSort);
    expect(output[0]).toEqual(be1A);
    expect(output[1]).toEqual(s2A1A);
    expect(output[2]).toEqual(s2A1B);
    expect(output[3]).toEqual(be3A);
});

test("sortAudioElements with some tabindexes put missing ones last", () => {
    const input = document.createElement("div");
    const tg1 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup", // no tabindex, should be last
        parent: input,
    });
    const be1A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The first block</p>",
        tabindex: "3", // should be ignored
        parent: tg1,
    });

    const tg2 = createDiv({
        id: "tg2",
        classAttr: "bloom-translationGroup",
        tabindex: "2",
        parent: input,
    });
    const be2A = createDiv({
        id: "be2A",
        classAttr: "bloom-editable",
        tabindex: "1", // should be ignored
        parent: tg2,
    });
    const p2A1 = createPara({ id: "p2A1", classAttr: "", parent: be2A });
    const s2A1A = createSpan({
        id: "s2A1A",
        classAttr: "audio-sentence",
        content: "The first sentence in the second group",
        parent: p2A1,
    });
    const s2A1B = createSpan({
        id: "s2A1B",
        classAttr: "audio-sentence",
        content: "The second sentence in the second group",
        parent: p2A1,
    });

    const tg3 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        content: "",
        parent: input,
    });
    const be3A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The third block</p>",
        tabindex: "0", // should be ignored
        parent: tg3,
    });

    const toSort = [be1A, s2A1A, s2A1B, be3A];
    const output = sortAudioElements(toSort);
    expect(output[0]).toEqual(s2A1A); // first in doc order of item with tabindex.
    expect(output[1]).toEqual(s2A1B);
    expect(output[2]).toEqual(be1A); // no tabindex, sorted to end, first in doc order of those without tabindex
    expect(output[3]).toEqual(be3A); // no tabindex, sorted to end, after be1A in doc order
});

test("sortAudioElements re-orders sentences and blocks", () => {
    const input = document.createElement("div");
    const tg1 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        tabindex: "101",
        parent: input,
    });
    const be1A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The first block (read fifth)</p>",
        tabindex: "100", // should be ignored
        parent: tg1,
    });

    const tg2 = createDiv({
        id: "tg2",
        classAttr: "bloom-translationGroup",
        tabindex: "100",
        parent: input,
    });
    const be2A = createDiv({
        id: "be2A",
        classAttr: "bloom-editable audio-sentence",
        tabindex: "23", // should be ignored
        parent: tg2,
    });
    const p2A1 = createPara({ id: "p2A1", classAttr: "", parent: be2A });
    const s2A1A = createSpan({
        id: "s2A1A",
        classAttr: "audio-sentence",
        content: "The first sentence in the second group (read ",
        parent: p2A1,
    });
    const s2A1B = createSpan({
        id: "s2A1B",
        classAttr: "audio-sentence",
        content: "The second sentence in the second group",
        parent: p2A1,
    });

    const tg3 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        tabindex: "11",
        parent: input,
    });
    const be3A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        tabindex: "0", // should be ignored
        parent: tg3,
    });
    const p3A1 = createPara({
        id: "p3A1",
        classAttr: "",
        parent: be3A,
    });
    const s3A1A = createSpan({
        id: "s3A1A",
        classAttr: "audio-sentence",
        content: "The first sentence in the third group (read first)",
        parent: p3A1,
    });
    const s3A1B = createSpan({
        id: "s3A1B",
        classAttr: "audio-sentence",
        content: "The second sentence in the thrid group (read second)",
        parent: p3A1,
    });
    const toSort = [be1A, s2A1A, s2A1B, s3A1A, s3A1B];
    const output = sortAudioElements(toSort);
    expect(output[0]).toEqual(s3A1A);
    expect(output[1]).toEqual(s3A1B);
    expect(output[2]).toEqual(s2A1A);
    expect(output[3]).toEqual(s2A1B);
    expect(output[4]).toEqual(be1A);
});

test("sortAudioElements re-orders blocks", () => {
    const input = document.createElement("div");
    const tg1 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        tabindex: "1000",
        parent: input,
    });
    const be1A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The first block (read third)</p>",
        tabindex: "3", // should be ignored
        parent: tg1,
    });

    const tg2 = createDiv({
        id: "tg2",
        classAttr: "bloom-translationGroup",
        tabindex: "101",
        parent: input,
    });
    const be2A = createDiv({
        id: "be2A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The second block (read second)</p>",
        tabindex: "8000", // should be ignored
        parent: tg2,
    });

    const tg3 = createDiv({
        id: "tg1",
        classAttr: "bloom-translationGroup",
        tabindex: "11",
        parent: input,
    });
    const be3A = createDiv({
        id: "be1A",
        classAttr: "bloom-editable audio-sentence",
        content: "<p>The third block (read first)</p>",
        tabindex: "0", // should be ignored
        parent: tg3,
    });

    const toSort = [be1A, be2A, be3A];
    const output = sortAudioElements(toSort);
    expect(output[0]).toEqual(be3A);
    expect(output[1]).toEqual(be2A);
    expect(output[2]).toEqual(be1A);
});
