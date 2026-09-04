import { beforeEach, describe, expect, test, vi } from "vitest";

const narrationMocks = vi.hoisted(() => ({
    playAllAudio: vi.fn(),
    playAllVideo: vi.fn(),
    stopPlayAllVideoPlayback: vi.fn(),
}));

vi.mock("./narration", () => ({
    cancelVideoFirstFramePriming: vi.fn(),
    kAudioSentence: "audio-sentence",
    playAllAudio: narrationMocks.playAllAudio,
    playAllVideo: narrationMocks.playAllVideo,
    stopPlayAllVideoPlayback: narrationMocks.stopPlayAllVideoPlayback,
    urlPrefix: () => "",
}));

import { performCheck, performTryAgain } from "./dragActivityRuntime";

describe("dragActivityRuntime correct/wrong media sequencing", () => {
    const createdAudioElements: HTMLAudioElement[] = [];

    beforeEach(() => {
        narrationMocks.playAllAudio.mockReset();
        narrationMocks.playAllVideo.mockReset();
        createdAudioElements.length = 0;

        const FakeAudio = function (this: any) {
            const audio = document.createElement("audio") as HTMLAudioElement;
            audio.play = vi.fn(() => Promise.resolve()) as any;
            createdAudioElements.push(audio);
            return audio;
        } as any;
        (globalThis as any).Audio = FakeAudio;
    });

    test("plays follow-up media after correct sound ends", () => {
        const wrapper = document.createElement("div");
        const page = document.createElement("div");
        page.classList.add("bloom-page");
        page.setAttribute("data-correct-sound", "ding.mp3");
        wrapper.appendChild(page);

        const checkButton = document.createElement("button");
        checkButton.classList.add("check-button");
        page.appendChild(checkButton);

        const correctItem = document.createElement("div");
        correctItem.classList.add("drag-item-correct", "bloom-canvas-element");
        const video = document.createElement("video");
        correctItem.appendChild(video);
        page.appendChild(correctItem);

        performCheck({ currentTarget: checkButton } as unknown as MouseEvent);

        expect(narrationMocks.playAllVideo).not.toHaveBeenCalled();
        expect(createdAudioElements.length).toBe(1);

        createdAudioElements[0].dispatchEvent(new Event("ended"));

        expect(narrationMocks.playAllVideo).toHaveBeenCalledTimes(1);
        expect(narrationMocks.playAllVideo.mock.calls[0][0]).toEqual([video]);
    });

    // BL-16146: the follow-up media callback fires when the correct/wrong
    // sound ends, which can be after the user has already clicked Show Correct
    // or Try Again. Playing then would call playAllVideo and silently cancel
    // the solution videos Show Correct started.
    test("skips follow-up media if the page left the correct/wrong state while the sound played", () => {
        const wrapper = document.createElement("div");
        const page = document.createElement("div");
        page.classList.add("bloom-page");
        page.setAttribute("data-correct-sound", "ding.mp3");
        wrapper.appendChild(page);

        const checkButton = document.createElement("button");
        checkButton.classList.add("check-button");
        page.appendChild(checkButton);

        const correctItem = document.createElement("div");
        correctItem.classList.add("drag-item-correct", "bloom-canvas-element");
        const video = document.createElement("video");
        correctItem.appendChild(video);
        page.appendChild(correctItem);

        performCheck({ currentTarget: checkButton } as unknown as MouseEvent);
        expect(narrationMocks.playAllVideo).not.toHaveBeenCalled();

        // User clicks Try Again (or Show Correct) before the sound finishes;
        // both take the page out of the drag-activity-correct/wrong state.
        performTryAgain({ currentTarget: checkButton } as unknown as MouseEvent);

        createdAudioElements[0].dispatchEvent(new Event("ended"));

        expect(narrationMocks.playAllVideo).not.toHaveBeenCalled();
        expect(narrationMocks.playAllAudio).not.toHaveBeenCalled();
    });

    test("plays follow-up media immediately when correct sound is none", () => {
        const wrapper = document.createElement("div");
        const page = document.createElement("div");
        page.classList.add("bloom-page");
        page.setAttribute("data-correct-sound", "none");
        wrapper.appendChild(page);

        const checkButton = document.createElement("button");
        checkButton.classList.add("check-button");
        page.appendChild(checkButton);

        const correctItem = document.createElement("div");
        correctItem.classList.add("drag-item-correct", "bloom-canvas-element");
        const video = document.createElement("video");
        correctItem.appendChild(video);
        page.appendChild(correctItem);

        performCheck({ currentTarget: checkButton } as unknown as MouseEvent);

        expect(narrationMocks.playAllVideo).toHaveBeenCalledTimes(1);
        expect(narrationMocks.playAllVideo.mock.calls[0][0]).toEqual([video]);
        expect(createdAudioElements.length).toBe(0);
    });
});

import { prepareActivity, undoPrepareActivity } from "./dragActivityRuntime";

describe("undoPrepareActivity works on the page it is given, and only that page", () => {
    // prepareActivity records where each draggable started. Undoing has to put them back -- and it
    // has to do that to the page it is handed, which is not always the page we prepared: Bloom
    // desktop hands us a detached COPY, because that is how a toolbox tool takes its markup off the
    // copy of the page being saved, while the user goes on playing.
    //
    // So a copy needs the same treatment as the real page (a book should record where the author
    // put the draggables, not where a tester dragged them), and the live page must be left alone.
    const authoredLeft = "10px";
    const authoredTop = "20px";

    function makeActivityPage() {
        const page = document.createElement("div");
        page.classList.add("bloom-page");
        page.setAttribute("data-activity", "drag-letter-to-target");
        const draggable = document.createElement("div");
        draggable.setAttribute("data-draggable-id", "d1");
        draggable.style.left = authoredLeft;
        draggable.style.top = authoredTop;
        page.appendChild(draggable);
        const img = document.createElement("img");
        page.appendChild(img);
        document.body.appendChild(page);
        return { page, draggable, img };
    }

    beforeEach(() => {
        document.body.innerHTML = "";
    });

    test("undoing a COPY puts the COPY back to the authored positions", () => {
        const { page, draggable } = makeActivityPage();
        prepareActivity(page, () => {});

        // The tester drags the item onto its target.
        draggable.style.left = "300px";
        draggable.style.top = "400px";
        draggable.classList.add("bloom-draggedToTarget");
        expect(draggable.style.left).toBe("300px"); // sanity: the drag took

        const copy = page.cloneNode(true) as HTMLElement;
        expect(
            copy.querySelector<HTMLElement>("[data-draggable-id]")!.style.left,
        ).toBe("300px"); // sanity: the copy starts with the dragged position

        undoPrepareActivity(copy);

        const inCopy = copy.querySelector<HTMLElement>("[data-draggable-id]")!;
        expect(inCopy.style.left).toBe(authoredLeft);
        expect(inCopy.style.top).toBe(authoredTop);
        expect(inCopy.classList.contains("bloom-draggedToTarget")).toBe(false);
    });

    test("undoing a COPY leaves the live page's drags alone", () => {
        const { page, draggable } = makeActivityPage();
        prepareActivity(page, () => {});
        draggable.style.left = "300px";
        draggable.style.top = "400px";

        undoPrepareActivity(page.cloneNode(true) as HTMLElement);

        expect(draggable.style.left).toBe("300px");
        expect(draggable.style.top).toBe("400px");
    });

    test("undoing the page it prepared still restores it, as leaving Play must", () => {
        const { page, draggable } = makeActivityPage();
        prepareActivity(page, () => {});
        draggable.style.left = "300px";
        draggable.style.top = "400px";

        undoPrepareActivity(page);

        expect(draggable.style.left).toBe(authoredLeft);
        expect(draggable.style.top).toBe(authoredTop);
    });

    test("cleaning a copy does not cost the live page its restore", () => {
        // The record must survive being used on a copy, or the live page would be stuck wherever
        // the tester dragged it when they finally left the Play tab.
        const { page, draggable } = makeActivityPage();
        prepareActivity(page, () => {});
        draggable.style.left = "300px";

        undoPrepareActivity(page.cloneNode(true) as HTMLElement);
        undoPrepareActivity(page);

        expect(draggable.style.left).toBe(authoredLeft);
    });

    test("markup added for play is taken off the copy", () => {
        const { page, img } = makeActivityPage();
        prepareActivity(page, () => {});
        expect(img.getAttribute("draggable")).toBe("false"); // sanity: preparing marked it

        const copy = page.cloneNode(true) as HTMLElement;
        undoPrepareActivity(copy);

        expect(
            copy.getElementsByTagName("img")[0].hasAttribute("draggable"),
        ).toBe(false);
        // ...and the live page is still prepared, because it is still being played.
        expect(img.getAttribute("draggable")).toBe("false");
    });
});
