import { expect, Locator, Page } from "@playwright/test";

// Page object for driving bloom-player the way a user does, against the real
// built dist/bloomplayer.htm. Successor to src/stories/BloomPlayerTester.ts,
// with Playwright auto-waiting locators instead of fixed sleeps.
//
// Key rule: swiper keeps the neighboring slides' content in the DOM, so any
// assertion about what the user is "seeing" must be scoped to the active slide.
export class PlayerPage {
    constructor(public readonly page: Page) {}

    // Navigates to the player with the given book url (relative urls resolve
    // against the e2e server, e.g. "/testBooks/multibook-index/index.htm").
    public async gotoBook(
        bookUrl: string,
        params: Record<string, string> = {},
    ): Promise<void> {
        const query = new URLSearchParams({ url: bookUrl, ...params });
        await this.page.goto(`/bloomplayer.htm?${query.toString()}`);
        await this.shouldShowAPage();
        await this.waitForPlayerToSettle();
    }

    // After loading a book (initially or by following a cross-book link), the
    // player runs a fixed 500ms "startingUpSwiper" stabilization window
    // (finishUp in bloom-player-core) during which swiper interaction is
    // suppressed and the position is forced back to the start page. There is
    // currently no DOM signal for the end of that window, so we wait it out.
    // (Candidate improvement during the modernization: expose a ready
    // attribute so this — and manual testers — can know the player is ready.)
    public async waitForPlayerToSettle(): Promise<void> {
        await this.page.waitForTimeout(800);
        // If the browser blocked audio autoplay, the player covers the page
        // with a big play button; a user's first act is to tap it.
        const bigPlayButton = this.page.locator(
            ".bigButtonOverlay .bigPlayButton",
        );
        if (await bigPlayButton.isVisible()) {
            await bigPlayButton.click();
            await bigPlayButton.waitFor({ state: "hidden" });
        }
    }

    public activePage(): Locator {
        return this.page.locator(".swiper-slide-active .bloom-page");
    }

    // Resolves when the player has finished loading a book and is showing a page.
    public async shouldShowAPage(): Promise<void> {
        await expect(this.activePage()).toBeVisible();
    }

    public async shouldSeePageText(text: string): Promise<void> {
        await expect(
            this.activePage().getByText(text, { exact: false }).first(),
        ).toBeVisible();
    }

    public nextButton(): Locator {
        return this.page.locator(".swiper-button-next");
    }

    public prevButton(): Locator {
        return this.page.locator(".swiper-button-prev");
    }

    // The action helpers settle first: the preceding step may have loaded a
    // new book (multi-book links, back button), putting the player back in its
    // input-suppressing startup window.
    public async goToNextPage(): Promise<void> {
        await this.waitForPlayerToSettle();
        await this.nextButton().click();
    }

    public async goToPreviousPage(): Promise<void> {
        await this.waitForPlayerToSettle();
        await this.prevButton().click();
    }

    public async clickLinkInPage(text: string): Promise<void> {
        await this.waitForPlayerToSettle();
        await this.activePage()
            .locator("a", { hasText: text })
            .first()
            .click();
    }

    public backButton(): Locator {
        return this.page.getByTestId("history-back-button");
    }

    public async clickBackButton(): Promise<void> {
        await this.waitForPlayerToSettle();
        await this.backButton().click();
    }

    public languageMenuButton(): Locator {
        return this.page.locator('[aria-label="Choose Language"]');
    }

    public playPauseButton(): Locator {
        return this.page.locator('[aria-label="PlayPause"] button');
    }
}
