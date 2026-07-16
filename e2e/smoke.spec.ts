import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// The most basic end-to-end check: the built player loads a book from a folder
// of files and displays its first page, without throwing.

test("loads a book and shows its cover", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/multibook-target1/index.htm");
    await player.shouldShowAPage();
    await player.shouldSeePageText("multibook-target1");

    expect(pageErrors).toEqual([]);
});
