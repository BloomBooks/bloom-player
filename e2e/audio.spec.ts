import { expect, test } from "@playwright/test";

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
