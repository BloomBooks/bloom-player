import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// Interactive activity pages, using the checked-in Bloom5.4-activities book.
// Page index 1 is a simple-dom-choice quiz: clicking an answer gives visual
// feedback (and plays the right/wrong sound).

test("clicking the correct quiz answer marks it correct", async ({ page }) => {
    const player = new PlayerPage(page);
    await player.gotoBook(
        "/testBooks/Bloom5.4-activities/Bloom5.4-activities.htm",
        { "start-page": "1" },
    );
    await player.shouldShowAPage();

    const correctButton = player
        .activePage()
        .locator('button.player-button[data-activityrole="correct-answer"]');
    await expect(correctButton).toBeVisible();
    await correctButton.click();
    await expect(correctButton).toHaveClass(/chosen-correct/);
});

test("clicking a wrong quiz answer marks it wrong", async ({ page }) => {
    const player = new PlayerPage(page);
    await player.gotoBook(
        "/testBooks/Bloom5.4-activities/Bloom5.4-activities.htm",
        { "start-page": "1" },
    );
    await player.shouldShowAPage();

    const wrongButton = player
        .activePage()
        .locator('button.player-button[data-activityrole="wrong-answer"]')
        .first();
    await wrongButton.click();
    await expect(wrongButton).toHaveClass(/chosen-wrong/);
});

// sample-canvas-activity's snake page names an activity ("snake") that isn't
// built in, so the player loads snake.js from the book's own folder and runs it.
test("an activity script from the book's folder loads and runs", async ({
    page,
}) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const scriptResponse = page.waitForResponse((response) =>
        response.url().endsWith("/testBooks/sample-canvas-activity/snake.js"),
    );

    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/sample-canvas-activity/index.htm");
    expect((await scriptResponse).status()).toBe(200);

    // Page there (rather than starting on it) so the script has loaded first.
    await player.goToNextPage();
    await player.goToNextPage();
    const snakePage = player.activePage();
    await expect(snakePage).toHaveAttribute("data-activity", "snake");

    // The game draws the snake and the apple on the page's canvas.
    await expect
        .poll(() =>
            snakePage.locator("canvas").evaluate((canvas: HTMLCanvasElement) =>
                canvas
                    .getContext("2d")!
                    .getImageData(0, 0, canvas.width, canvas.height)
                    .data.some((value, i) => i % 4 === 3 && value !== 0),
            ),
        )
        .toBe(true);
    expect(pageErrors).toEqual([]);
});

// A book-folder activity script can finish loading after the player has built
// the book's pages, so the activity must not depend on initializePageHtml having
// run. test-widget-message-activity's pages carry the activity's own Forward and
// Back buttons; the script is held back until the book is showing, to force the
// slow case.
test("an activity script that loads after the book is built still works", async ({
    page,
}) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    let releaseScript = () => {};
    const scriptReleased = new Promise<void>((r) => (releaseScript = r));
    await page.route("**/bl-9871-test-activity.js", async (route) => {
        await scriptReleased;
        await route.continue();
    });

    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/test-widget-message-activity/index.htm");
    const scriptLoaded = page.waitForResponse("**/bl-9871-test-activity.js");
    releaseScript();
    await scriptLoaded;
    await player.nextButton().click();
    await expect(player.activePage()).toHaveAttribute("data-page-number", "1");

    const forward = player
        .activePage()
        .getByRole("button", { name: "Forward" });
    await expect(forward).toHaveCount(1); // not missing, and not added twice
    await forward.click();
    await expect(player.activePage()).toHaveAttribute("data-page-number", "2");
    expect(pageErrors).toEqual([]);
});
