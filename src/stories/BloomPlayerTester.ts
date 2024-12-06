import { userEvent, waitFor, within, expect } from "@storybook/test";
export class BloomPlayerTester {
    private iframeDoc: Document;

    constructor(canvasElement: HTMLElement) {
        this.iframeDoc = null as unknown as Document;
        this.initialize(canvasElement);
    }

    private async initialize(
        canvasElement: HTMLElement,
        maxWaitMs: number = 5000,
    ): Promise<void> {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            const iframe = canvasElement.querySelector("iframe");
            if (iframe) {
                if (iframe.contentDocument) {
                    this.iframeDoc = iframe.contentDocument;
                    return;
                }
                this.iframeDoc = await new Promise<Document>((resolve) => {
                    iframe.onload = () => resolve(iframe.contentDocument!);
                });
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(
            `Could not find iframe within element: ${canvasElement.tagName}#${canvasElement.id} after ${maxWaitMs}ms`,
        );
    }

    async clickLinkByText(text: string) {
        await pause();
        const link = await waitFor(
            () => {
                const links = Array.from(this.iframeDoc.querySelectorAll("a"));
                const link = links.find((el) => el.textContent?.includes(text));
                if (!link)
                    throw new Error(`Link containing "${text}" not found`);
                return link;
            },
            { timeout: 5000 },
        );
        await userEvent.click(link as HTMLElement);
    }

    async goToNextPage() {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rightButton = await waitFor(() => {
            return this.iframeDoc.documentElement.querySelector(
                ".swiper-button-right",
            );
        });
        await userEvent.click(rightButton!);
    }

    public async clickBackButton() {
        await pause();
        const back = await this.getHistoryBackButton();
        await userEvent.click(back);
    }

    public async waitForHistoryBackButtonToGoAway() {
        await waitFor(
            async () => {
                const element = await this.getHistoryBackButton();
                // is it disabled?
                if ((element as HTMLButtonElement).disabled) return element;
                throw new Error("History back button is not disabled");
            },
            { timeout: 3000 },
        );
    }

    public async getHistoryBackButton() {
        return await waitFor(
            () => {
                const element = this.iframeDoc.querySelector(
                    '[data-testid="history-back-button"]',
                );
                if (!element)
                    throw new Error(
                        'Element with data-testid "history-back-button" not found',
                    );
                return element as HTMLElement;
            },
            { timeout: 5000 },
        );
    }

    async shouldSeeText(text: string) {
        await pause();
        await waitFor(
            () => {
                const xpath = `//*[contains(text(), "${text}")]`;
                const result = this.iframeDoc.evaluate(
                    xpath,
                    this.iframeDoc,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                );
                const element = result.singleNodeValue;
                if (!element)
                    throw new Error(`Text "${text}" not found in document`);
                return element;
            },
            { timeout: 5000 },
        );
    }
}

/* oh, the shame! */
async function pause() {
    await new Promise((resolve) => setTimeout(resolve, 300));
}
