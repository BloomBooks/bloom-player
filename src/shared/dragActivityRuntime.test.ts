import { beforeEach, describe, expect, test, vi } from "vitest";

const narrationMocks = vi.hoisted(() => ({
    playAllAudio: vi.fn(),
    playAllVideo: vi.fn(),
}));

vi.mock("./narration", () => ({
    kAudioSentence: "audio-sentence",
    playAllAudio: narrationMocks.playAllAudio,
    playAllVideo: narrationMocks.playAllVideo,
    urlPrefix: () => "",
}));

import { performCheck } from "./dragActivityRuntime";

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
