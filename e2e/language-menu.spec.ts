import { expect, test } from "@playwright/test";
import { PlayerPage } from "./playerPage";

// The language menu in the control bar, using a Tetun/English book.
// (DOM-level visibility switching per language is covered by the jsdom
// component tests; here we exercise the real control-bar wiring.)

test("lists the book's languages and switches the active one", async ({
    page,
}) => {
    const player = new PlayerPage(page);
    await player.gotoBook("/testBooks/drag and drop games/index.htm", {
        initiallyShowAppBar: "true",
    });
    await player.shouldShowAPage();

    await player.languageMenuButton().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Languages in this book:")).toBeVisible();
    await expect(dialog.getByText("Tetun")).toBeVisible();
    await expect(dialog.getByText("English")).toBeVisible();

    // The book's primary language starts selected.
    await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(1);
    const tetunRadio = dialog
        .locator("label", { hasText: "Tetun" })
        .getByRole("radio");
    await expect(tetunRadio).toBeChecked();

    // Choosing English closes the dialog...
    await dialog.locator("label", { hasText: "English" }).click();
    await expect(dialog).not.toBeVisible();

    // ...and reopening it shows English as the active language.
    await player.languageMenuButton().click();
    const reopenedDialog = page.getByRole("dialog");
    await expect(
        reopenedDialog
            .locator("label", { hasText: "English" })
            .getByRole("radio"),
    ).toBeChecked();
});
