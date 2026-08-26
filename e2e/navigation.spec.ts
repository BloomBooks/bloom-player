import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// Real page-turning through the real swiper: something jsdom component tests
// cannot cover (swiper has no geometry there).
//
// multibook-target1's pages, in order: front cover (0), inside front cover (1),
// title page (2), credits (3), the crab content page (4), inside back cover (5),
// outside back cover (6).

test("turns pages forward and back with the navigation buttons", async ({
    page,
}) => {
    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/multibook-target1/index.htm");
    await player.shouldSeePageText("multibook-target1");

    // On the cover, there is no previous page to go to.
    await expect(player.activePage()).toHaveClass(/outsideFrontCover/);
    await expect(player.prevButton()).toHaveClass(/swiper-button-disabled/);
    await expect(player.nextButton()).not.toHaveClass(
        /swiper-button-disabled/,
    );

    // Forward: the inside front cover becomes the active page.
    await player.goToNextPage();
    await expect(player.activePage()).toHaveClass(/insideFrontCover/);
    await expect(player.prevButton()).not.toHaveClass(
        /swiper-button-disabled/,
    );

    // And back again to the cover.
    await player.goToPreviousPage();
    await expect(player.activePage()).toHaveClass(/outsideFrontCover/);
});

test("turns pages by content, from the crab page to the back covers", async ({
    page,
}) => {
    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/multibook-target1/index.htm", {
        "start-page": "4",
    });
    await player.shouldSeePageText("This is the crab page the green book");

    await player.goToNextPage();
    await expect(player.activePage()).toHaveClass(/insideBackCover/);

    await player.goToNextPage();
    await player.shouldSeePageText("This is the back cover of the green book");
    // At the last page, next is disabled.
    await expect(player.nextButton()).toHaveClass(/swiper-button-disabled/);

    await player.goToPreviousPage();
    await player.goToPreviousPage();
    await player.shouldSeePageText("This is the crab page the green book");
});
