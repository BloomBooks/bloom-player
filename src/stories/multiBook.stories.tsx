import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { BloomPlayerIframe } from "./iframeStoryUtils";

/* This uses an iframe, so normal dev server compilation is not effective.
Therefore, when developing with this, use `yarn buildForStorybook` to update non-storybook code.

The point of this story is really just to host a book that has links to a second book. What makes
that possible is the proxy defined in .storybook/main.ts, not here.
*/

const meta: Meta<typeof BloomPlayerIframe> = {
    title: "MultiBook",
    component: BloomPlayerIframe,
};
export default meta;

type Story = StoryObj<typeof BloomPlayerIframe>;

export const UsePageIndex: Story = {
    args: {
        bookUrl: "testBooks/multibook-index/index.htm",
        bookPageIndex: "4",
    },
    // doesn't work storyName: "Use `bookPageIndex` to specify the starting page",
};
UsePageIndex.storyName =
    "Use `bookPageIndex` to specify the starting page of the first book";

export const Default: Story = {
    args: {
        bookUrl:
            "testBooks/multibook-index/index.htm#653f29c1-665b-4d63-a061-086401abc106",
    },
};
Default.storyName =
    "Use #pageId to specify the starting page of the first book";
