import { describe, expect, test, vi } from "vitest";

vi.mock("./bloom-player-core", () => ({
    BloomPlayerCore: {
        storeVideoAnalytics: () => {},
    },
}));

import { Video } from "./video";

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
});
