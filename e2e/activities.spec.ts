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
