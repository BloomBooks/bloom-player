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
