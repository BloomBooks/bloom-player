import { describe, expect, test, vi } from "vitest";

vi.mock("./bloom-player-core", () => ({
    BloomPlayerCore: {
        storeVideoAnalytics: () => {},
    },
}));

import { Video } from "./video";
import { PlayFailed, PlayUnblocked } from "./shared/narration";

describe("Video.pageHasVideo", () => {
    test("returns true for a visible video container", () => {
        const page = document.createElement("div");
        const container = document.createElement("div");
        container.classList.add("bloom-videoContainer");
        container.appendChild(document.createElement("video"));
        page.appendChild(container);

        expect(Video.pageHasVideo(page)).toBe(true);
    });

    test("returns true when the video container is display:none", () => {
        const page = document.createElement("div");
        const container = document.createElement("div");
        container.classList.add("bloom-videoContainer");
        container.style.display = "none";
        container.appendChild(document.createElement("video"));
        page.appendChild(container);

        expect(Video.pageHasVideo(page)).toBe(true);
    });

    test("returns true when an ancestor of the video container is hidden", () => {
        const page = document.createElement("div");
        const hiddenWrapper = document.createElement("div");
        hiddenWrapper.style.display = "none";
        const container = document.createElement("div");
        container.classList.add("bloom-videoContainer");
        container.appendChild(document.createElement("video"));
        hiddenWrapper.appendChild(container);
        page.appendChild(hiddenWrapper);

        expect(Video.pageHasVideo(page)).toBe(true);
    });

    test("returns true when the video container has visibility:hidden", () => {
        const page = document.createElement("div");
        const container = document.createElement("div");
        container.classList.add("bloom-videoContainer");
        container.style.visibility = "hidden";
        container.appendChild(document.createElement("video"));
        page.appendChild(container);

        expect(Video.pageHasVideo(page)).toBe(true);
    });

    test("returns false when there is no video element", () => {
        const page = document.createElement("div");
        const container = document.createElement("div");
        container.classList.add("bloom-videoContainer");
        page.appendChild(container);

        expect(Video.pageHasVideo(page)).toBe(false);
    });

    test("resumes autoplay-blocked sequence and clears blocked classes", async () => {
        vi.useFakeTimers();
        const playFailed = vi.fn();
        const playUnblocked = vi.fn();
        PlayFailed.subscribe(playFailed);
        PlayUnblocked.subscribe(playUnblocked);

        try {
            const page = document.createElement("div");
            page.classList.add("bloom-page");

            const firstContainer = document.createElement("div");
            firstContainer.classList.add("bloom-videoContainer");
            const firstVideo = document.createElement("video");
            firstContainer.appendChild(firstVideo);
            page.appendChild(firstContainer);

            const secondContainer = document.createElement("div");
            secondContainer.classList.add("bloom-videoContainer");
            const secondVideo = document.createElement("video");
            secondContainer.appendChild(secondVideo);
            page.appendChild(secondContainer);

            document.body.appendChild(page);

            const firstPlay = vi.fn(() => Promise.resolve());
            const secondPlay = vi.fn(() => Promise.resolve());
            Object.defineProperty(firstVideo, "play", { value: firstPlay });
            Object.defineProperty(secondVideo, "play", { value: secondPlay });
            Object.defineProperty(secondVideo, "readyState", {
                value: HTMLMediaElement.HAVE_CURRENT_DATA,
                configurable: true,
            });

            const manager = new Video();
            manager.HandlePageBeforeVisible(page);
            (manager as any).enterAutoplayBlockedMode([
                firstVideo,
                secondVideo,
            ]);

            expect(playFailed).toHaveBeenCalledTimes(1);
            expect(firstContainer.classList.contains("autoplayBlocked")).toBe(
                true,
            );
            expect(
                firstContainer.classList.contains("autoplayBlockedPrimary"),
            ).toBe(true);
            expect(firstContainer.classList.contains("paused")).toBe(true);
            expect(
                secondContainer.classList.contains("autoplayBlockedSuppressed"),
            ).toBe(true);

            firstVideo.dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true }),
            );
            await Promise.resolve();

            expect(playUnblocked).toHaveBeenCalledTimes(1);
            expect(firstContainer.classList.contains("autoplayBlocked")).toBe(
                false,
            );
            expect(
                firstContainer.classList.contains("autoplayBlockedPrimary"),
            ).toBe(false);
            expect(
                secondContainer.classList.contains("autoplayBlockedSuppressed"),
            ).toBe(false);
            expect(firstContainer.classList.contains("paused")).toBe(false);
            expect(secondContainer.classList.contains("paused")).toBe(false);
            expect(firstPlay).toHaveBeenCalledTimes(1);
            expect(secondPlay).toHaveBeenCalledTimes(1);

            firstVideo.dispatchEvent(new Event("ended"));
            await Promise.resolve();

            expect(secondPlay).toHaveBeenCalledTimes(2);

            vi.runOnlyPendingTimers();
        } finally {
            PlayFailed.unsubscribe(playFailed);
            PlayUnblocked.unsubscribe(playUnblocked);
            vi.useRealTimers();
        }
    });

    test("autoplay-unblock priming does not pause second video during real playback", async () => {
        vi.useFakeTimers();
        try {
            const page = document.createElement("div");
            page.classList.add("bloom-page");

            const firstContainer = document.createElement("div");
            firstContainer.classList.add("bloom-videoContainer");
            const firstVideo = document.createElement("video");
            firstContainer.appendChild(firstVideo);
            page.appendChild(firstContainer);

            const secondContainer = document.createElement("div");
            secondContainer.classList.add("bloom-videoContainer");
            const secondVideo = document.createElement("video");
            secondContainer.appendChild(secondVideo);
            page.appendChild(secondContainer);

            document.body.appendChild(page);

            const firstPlay = vi.fn(() => Promise.resolve());
            const secondPlay = vi.fn(() => Promise.resolve());
            const secondPause = vi.fn();
            Object.defineProperty(firstVideo, "play", { value: firstPlay });
            Object.defineProperty(secondVideo, "play", { value: secondPlay });
            Object.defineProperty(secondVideo, "pause", { value: secondPause });
            Object.defineProperty(secondVideo, "readyState", {
                value: HTMLMediaElement.HAVE_CURRENT_DATA,
                configurable: true,
            });

            const manager = new Video();
            manager.HandlePageBeforeVisible(page);
            (manager as any).enterAutoplayBlockedMode([firstVideo, secondVideo]);

            firstVideo.dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true }),
            );
            await Promise.resolve();

            // First video ends quickly, so second real playback starts before the
            // priming listener timeout would remove itself.
            firstVideo.dispatchEvent(new Event("ended"));
            await Promise.resolve();

            // Simulate second video beginning actual playback.
            secondVideo.dispatchEvent(new Event("playing"));
            await Promise.resolve();

            expect(secondPlay).toHaveBeenCalledTimes(2);
            expect(secondPause).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
