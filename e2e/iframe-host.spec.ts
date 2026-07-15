import { expect, test } from "@playwright/test";

// Embedding fidelity: the player running inside an iframe, the way real hosts
// embed it, communicating with the host page via postMessage.

test("works inside a host iframe and posts messages to the host", async ({
    page,
}) => {
    await page.goto("/host.html");
    const player = page.frameLocator("#player");

    // The book loads and pages turn inside the iframe.
    await expect(
        player.locator(".swiper-slide-active .bloom-page").first(),
    ).toBeVisible();
    await expect(
        player.locator(".swiper-slide-active .bloom-page"),
    ).toHaveClass(/outsideFrontCover/);
    // Let the player's 500ms startup window pass (see PlayerPage.waitForPlayerToSettle).
    await page.waitForTimeout(800);
    await player.locator(".swiper-button-next").click();
    await expect(
        player.locator(".swiper-slide-active .bloom-page"),
    ).toHaveClass(/insideFrontCover/);

    // On load the player reports the book's properties to its host.
    const messages = () =>
        page.evaluate(() => (window as any).__messagesFromPlayer as string[]);
    await expect
        .poll(messages)
        .toEqual(
            expect.arrayContaining([
                expect.stringContaining('"messageType":"reportBookProperties"'),
            ]),
        );

    // With showBackButton=true and no in-player history, the back button is
    // enabled and clicking it defers to the host via a postMessage.
    const backButton = player.getByTestId("history-back-button");
    await expect(backButton).toBeVisible();
    await expect(backButton).toBeEnabled();
    await backButton.click();
    await expect
        .poll(messages)
        .toEqual(
            expect.arrayContaining([
                expect.stringContaining('"messageType":"backButtonClicked"'),
            ]),
        );
});
