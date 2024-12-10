import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { BloomPlayerIframe } from "./BloomPlayerIframe";

/* This uses an iframe, so normal dev server compilation is not effective.
Therefore, when developing with this, use `yarn watchForStorybook` to update non-storybook code.

The point of this story is really just to host a book that has links to a second book. What makes
that possible is the proxy defined in .storybook/main.ts, not here.
*/

const meta: Meta<typeof BloomPlayerIframe> = {
    title: "MultiBook",
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

export const UsePageIndex: Story = {
    args: {
        bookUrl: "testBooks/multibook-index/index.htm",
        bookPageIndex: "4",
        showBackButton: false,
    },
    // doesn't work storyName: "Use `bookPageIndex` to specify the starting page",
};
UsePageIndex.storyName =
    "Use `bookPageIndex` to specify the starting page of the first book";

export const UsePageId: Story = {
    args: {
        bookUrl:
            "testBooks/multibook-index/index.htm#653f29c1-665b-4d63-a061-086401abc106",
        showBackButton: false,
    },
};
UsePageId.storyName =
    "Use '#The-Page-ID to specify the starting page of the first book";
