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

// Embedded with showBackButton, the back button is an ellipsis by default
// (bloomlibrary.org uses it to go to the book's detail page); a host whose
// button really goes back asks for an arrow with backButtonIcon=arrow.
for (const [icon, label] of [
    [undefined, "More Menu"],
    ["arrow", "Go Back"],
    ["ellipsis", "More Menu"],
] as const) {
    test(`embedded back button with backButtonIcon=${icon} shows "${label}"`, async ({
        page,
    }) => {
        await page.goto("/host.html");
        // Replace the host's iframe (rather than changing its src) so the
        // assertion below can only match the player loaded with our param.
        await page.evaluate((icon) => {
            const old = document.getElementById("player") as HTMLIFrameElement;
            const iframe = old.cloneNode() as HTMLIFrameElement;
            if (icon) iframe.src += `&backButtonIcon=${icon}`;
            old.replaceWith(iframe);
        }, icon);
        const backButton = page
            .frameLocator("#player")
            .getByTestId("history-back-button");
        await expect(
            backButton.locator(`svg[aria-label="${label}"]`),
        ).toBeVisible();
    });
}
