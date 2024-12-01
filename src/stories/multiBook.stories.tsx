import React from "react";
import { StoryFn, Meta } from "@storybook/react";
import { BloomPlayerIframe } from "./iframeStoryUtils";

/* This uses an iframe, so normal dev server compilation is not effective.
Therefore, when developing with this, use `yarn buildForStorybook` to update non-storybook code.

The point of this story is really just to host a book that has links to a second book. What makes
that possible is the proxy defined in .storybook/main.ts, not here.
*/

export default {
    title: "MultiBook",
    component: BloomPlayerIframe,
} as Meta<typeof BloomPlayerIframe>;

export const Default: StoryFn<typeof BloomPlayerIframe> = (args) => (
    <BloomPlayerIframe
        {...args}
        bookUrl="testBooks/multibook-index/index.htm"
        bookPageIndex="4"
    />
);
