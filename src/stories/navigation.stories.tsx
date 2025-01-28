import type { Meta, StoryObj } from "@storybook/react";
import { BloomPlayerIframe } from "./BloomPlayerIframe";
import { BloomPlayerTester } from "./BloomPlayerTester";

/* This uses an iframe, so normal dev server compilation is not effective.
Therefore, when developing with this, use `yarn watchForStorybook` to update non-storybook code.

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
        allowToggleAppBar: {
            control: "boolean",
            description: "Allow the user to toggle the app bar in the player.",
            defaultValue: true,
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
        allowToggleAppBar: true,
    },
    play: async ({ canvasElement, step }) => {
        const tester = new BloomPlayerTester(canvasElement);

        await step("Jump to a certain page in another book", async () => {
            // This was flaky. Sometimes, especially after recompiling, clickLinkByText
            // did not wait long enough and could not find the button to click.
            await new Promise((resolve) => setTimeout(resolve, 200));
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
            // This was very flaky. Usually the test stuck here, apparently not
            // finding the button, though usually it reported that it couldn't find
            // multi-book index (without going there). Any kind of breakpoint made it
            // work, so I just added a bit more delay. Slower computers might need more,
            // but so far this is just a manually-run automated test, so it's not too
            // bad if it fails occasionally.
            await new Promise((resolve) => setTimeout(resolve, 200));
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
