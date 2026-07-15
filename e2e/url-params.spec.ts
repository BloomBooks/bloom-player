import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// The URL query parameters are the player's public API for hosts.

test("start-page opens the book at the requested page", async ({ page }) => {
    const player = new PlayerPage(page);
    // Page index 4 of this book is the crab content page (0-3 are front matter).
    await player.gotoBook("/testBooks/multibook-target1/index.htm", {
        "start-page": "4",
    });
    await player.shouldSeePageText("This is the crab page the green book");
});

test("hideNavButtons hides the page-turning buttons", async ({ page }) => {
    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/multibook-target1/index.htm", {
        hideNavButtons: "true",
    });
    await player.shouldShowAPage();
    // The buttons stay in the DOM but are disabled/hidden via this class.
    await expect(player.nextButton()).toHaveClass(/swiper-button-disabled/);
    await expect(player.prevButton()).toHaveClass(/swiper-button-disabled/);
});

test("showBackButton displays an enabled back button that defers to the host", async ({
    page,
}) => {
    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/multibook-target1/index.htm", {
        showBackButton: "true",
        initiallyShowAppBar: "true",
    });
    // Even with no in-player history, the button is enabled: showBackButton
    // means the host has its own history, and clicking sends it a
    // backButtonClicked message. (Without the param it starts disabled — see
    // multibook.spec.ts for the end-of-history case.)
    await expect(player.backButton()).toBeVisible();
    await expect(player.backButton()).toBeEnabled();
});
