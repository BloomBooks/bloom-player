import React, { useEffect, useRef } from "react";
import { StoryFn, Meta } from "@storybook/react";

// Component that wraps iframe and message handling
const IframeMessageListener = ({ bookUrl }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Validate origin if needed
            console.log("Received message:", event.data);
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return (
        <iframe
            ref={iframeRef}
            src={`/bloomplayer.htm?url=${encodeURIComponent(bookUrl)}`}
            style={{ width: "100%", height: "500px" }}
        />
    );
};

export default {
    title: "MultiBook",
    component: IframeMessageListener,
    args: {
        bookUrl:
            "https://bloomlibrary.org/bloom-player/bloomplayer.htm?url=https%3A%2F%2Fs3.amazonaws.com%2Fbloomharvest%2Fbep_langhout%2540sil.org%252fb0eb0027-cd2c-4b9c-a21d-c593308e339b%2Fbloomdigital%252findex.htm",
    },
    argTypes: {
        bookUrl: {
            control: "text",
            description: "URL of the book to display",
        },
    },
} as Meta<typeof IframeMessageListener>;

export const Default: StoryFn<typeof IframeMessageListener> = (args) => (
    <IframeMessageListener {...args} />
);
