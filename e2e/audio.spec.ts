import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// Talking-book narration and the blocked-autoplay path (BL-16146 territory):
// when the browser refuses to play media before a user gesture, the player
// must show its big play-button overlay and start narration after the tap.
//
// Chromium's new headless mode always allows autoplay and ignores the
// --autoplay-policy flag, so we simulate the browser's refusal directly:
// HTMLMediaElement.play() rejects with NotAllowedError (exactly what a real
// browser does) until the test flips __allowMediaPlay after the gesture.
//
// Deliberately NOT using PlayerPage.gotoBook here: its settle logic dismisses
// the very overlay this spec is about.

// Page index 7 of this book is "And finally, a talking page with no video."
// and has a real narration mp3 in the book's audio/ folder.
const kTalkingBookUrl = "/testBooks/sign-language-with-talking-book";
const kTalkingPageText = "And finally, a talking page with no video.";

test("narration is blocked before interaction, then plays after the big play button", async ({
    page,
}) => {
    await page.addInitScript(() => {
        const realPlay = HTMLMediaElement.prototype.play;
        (window as any).__allowMediaPlay = false;
        HTMLMediaElement.prototype.play = function () {
            if ((window as any).__allowMediaPlay) {
                return realPlay.call(this);
            }
            return Promise.reject(
                new DOMException(
                    "play() failed because the user didn't interact with the document first.",
                    "NotAllowedError",
                ),
            );
        };
    });

    // Folder-style url (no .htm): also exercises the <folder>/<folder>.htm
    // resolution rule.
    const query = new URLSearchParams({
        url: kTalkingBookUrl,
        "start-page": "7",
        initiallyShowAppBar: "true",
    });
    await page.goto(`/bloomplayer.htm?${query.toString()}`);
    const activePage = page.locator(".swiper-slide-active .bloom-page");
    await expect(activePage.getByText(kTalkingPageText)).toBeVisible();

    // The blocked play attempt makes the player show its big play button,
    // and no audio progresses.
    const bigPlayButton = page.locator(".bigButtonOverlay .bigPlayButton");
    await expect(bigPlayButton).toBeVisible();
    const anyAudioPlaying = () =>
        page.evaluate(() =>
            Array.from(document.querySelectorAll("audio")).some(
                (audio) => !audio.paused && audio.currentTime > 0,
            ),
        );
    expect(await anyAudioPlaying()).toBe(false);

    // After the user gesture (which in a real browser unlocks playback — our
    // stub models that by honoring the flag), narration starts: the current
    // sentence gets the audio highlight class and audio actually progresses.
    await page.evaluate(() => ((window as any).__allowMediaPlay = true));
    await bigPlayButton.click();
    await expect(bigPlayButton).not.toBeVisible();
    await expect(activePage.locator("span.ui-audioCurrent")).toBeVisible();
    await expect.poll(anyAudioPlaying, { timeout: 10_000 }).toBe(true);
});

// A copy of the talking page above whose narration is Ogg Opus, named by
// data-audio-src on the sentence (BL-17005). Page index 4 is that page.
const kOpusBookUrl = "/testBooks/opus-talking-book";
const kOpusSentenceId = "i8cfdc51a-ef47-479e-b166-2b82c8b623de";

test("narration marked as Opus requests the .opus file and plays to the end", async ({
    page,
}) => {
    // Media "ended" events don't bubble, but a capturing listener on the
    // document still sees them.
    await page.addInitScript(() => {
        (window as any).__endedSources = [];
        document.addEventListener(
            "ended",
            (e) =>
                (window as any).__endedSources.push(
                    (e.target as HTMLMediaElement).currentSrc,
                ),
            true,
        );
    });
    const narrationRequests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes(kOpusSentenceId)) {
            narrationRequests.push(request.url());
        }
    });
    const opusResponse = page.waitForResponse((response) =>
        response.url().includes(`/audio/${kOpusSentenceId}.opus`),
    );

    const player = new PlayerPage(page);
    await player.gotoBook(kOpusBookUrl, { "start-page": "4" });
    await player.shouldSeePageText(kTalkingPageText);

    expect((await opusResponse).status()).toBe(200);
    await expect
        .poll(
            () =>
                page.evaluate(
                    (id) =>
                        (window as any).__endedSources.some((src: string) =>
                            src.includes(`${id}.opus`),
                        ),
                    kOpusSentenceId,
                ),
            { timeout: 15_000 },
        )
        .toBe(true);
    expect(narrationRequests.some((url) => url.includes(".mp3"))).toBe(false);
});
