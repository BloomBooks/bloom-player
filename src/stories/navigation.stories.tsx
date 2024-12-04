import type { Meta, StoryObj } from "@storybook/react";
import { BloomPlayerIframe } from "./BloomPlayerIframe";
import { BloomPlayerTester } from "./BloomPlayerTester";

/* This uses an iframe, so normal dev server compilation is not effective.
Therefore, when developing with this, use `yarn buildForStorybook` to update non-storybook code.

The point of this story is really just to host a book that has links to a second book. What makes
that possible is the proxy defined in .storybook/main.ts, not here.
*/

const meta: Meta<typeof BloomPlayerIframe> = {
    title: "Automated/Navigation",
    component: BloomPlayerIframe,
    argTypes: {
        showBackButton: {
            control: "boolean",
            description:
                "Show back button in the player that will send a message to the host when the local history is empty and the user clicks it.",
            defaultValue: false,
        },
    },
};
export default meta;

type Story = StoryObj<typeof BloomPlayerIframe>;

export const Default: Story = {
    args: {
        bookUrl:
            "testBooks/multibook-index/index.htm#653f29c1-665b-4d63-a061-086401abc106",
        showBackButton: false,
    },
    play: async ({ canvasElement, step }) => {
        const tester = new BloomPlayerTester(canvasElement);

        await step("Jump to a certain page in another book", async () => {
            await tester.clickLinkByText("Crab Page");
            await tester.shouldSeeText("This is the crab page the green book");
        });

        await step(
            "Swipe pages to the back cover and then follow a link to jump to front cover",
            async () => {
                await tester.goToNextPage();
                await tester.goToNextPage();
                await tester.shouldSeeText(
                    "This is the back cover of the green book",
                );
                await tester.clickLinkByText("Jump to front cover");
            },
        );
        await step(
            "Jump back to the back cover and click a link within this book to the crab page",
            async () => {
                await tester.clickBackButton();
                await tester.shouldSeeText(
                    "This is the back cover of the green book",
                );
            },
        );
        await step(
            "Use a link that has the book and page id to jump to the crab page",
            async () => {
                await tester.clickLinkByText("using /book/bookId#pageId");
                await tester.shouldSeeText(
                    "This is the crab page the green book",
                );
            },
        );
        await step(
            'Use a link with a special "#back" href to get back to the back cover',
            async () => {
                await tester.shouldSeeText(
                    "This is the crab page the green book",
                );
                await tester.clickLinkByText('this "back" link');
                await tester.shouldSeeText(
                    "This is the back cover of the green book",
                );
            },
        );
        await step("Jump back to get back to the original book", async () => {
            await tester.clickBackButton();
            await tester.shouldSeeText(
                "This is a page in the index book that has links to another book",
            );
        });

        await step("Jump to this book's cover", async () => {
            await tester.clickLinkByText("This book Cover");
            await tester.shouldSeeText("multibook-index");
        });
        await step(
            "Jump back and verify that the back button is gone",
            async () => {
                await tester.clickBackButton();
                await tester.waitForHistoryBackButtonToGoAway();
            },
        );
        await step("Show the success page", async () => {
            await tester.goToNextPage();
            await tester.shouldSeeText("This is the end.");
        });
    },
};
