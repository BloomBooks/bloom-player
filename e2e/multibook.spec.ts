import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// Multi-book navigation: links between books via /book/<instanceId> urls (the
// e2e server provides the host-side id-to-folder mapping, like storybook does),
// the in-player history back button, and the special "#back" href.
// This is the Playwright port of the play() test in
// src/stories/navigation.stories.tsx, which it supersedes.

test("navigates between books and back through history", async ({ page }) => {
    const player = new PlayerPage(page);
    // Start on the index book's page of links (by page id hash).
    await player.gotoBook(
        "/testBooks/multibook-index/index.htm#653f29c1-665b-4d63-a061-086401abc106",
    );
    await player.shouldSeePageText(
        "This is a page in the index book that has links to another book",
    );

    // Jump to a certain page in another book.
    await player.clickLinkInPage("Crab Page");
    await player.shouldSeePageText("This is the crab page the green book");

    // Swipe (twice: past the inside back cover) to the outside back cover,
    // then follow a link to the front cover.
    await player.goToNextPage();
    await player.goToNextPage();
    await player.shouldSeePageText("This is the back cover of the green book");
    await player.clickLinkInPage("Jump to front cover");
    await player.shouldSeePageText("multibook-target1");

    // The back button returns to the back cover (within-book history).
    await player.clickBackButton();
    await player.shouldSeePageText("This is the back cover of the green book");

    // A link with book id and page id jumps to the crab page.
    await player.clickLinkInPage("using /book/bookId#pageId");
    await player.shouldSeePageText("This is the crab page the green book");

    // The special "#back" href behaves like the back button.
    await player.clickLinkInPage('this "back" link');
    await player.shouldSeePageText("This is the back cover of the green book");

    // Back across the book boundary, to the index book's links page.
    await player.clickBackButton();
    await player.shouldSeePageText(
        "This is a page in the index book that has links to another book",
    );

    // Jump to this book's cover, then back; history is now empty.
    await player.clickLinkInPage("This book Cover");
    await player.shouldSeePageText("multibook-index");
    await player.clickBackButton();
    await expect(player.backButton()).toBeDisabled();

    // The success page. (If the test got here, rejoice.)
    await player.goToNextPage();
    await player.shouldSeePageText("This is the end.");
});
