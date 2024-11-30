import React, { useEffect, useRef } from "react";
import { StoryFn, Meta } from "@storybook/react";

// Component that wraps iframe and message handling
const IframeMessageListener = ({ bookUrl, bookPageIndex }) => {
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
            src={`/bloomplayer.htm?url=${encodeURIComponent(bookUrl)}&start-page=${bookPageIndex}`}
            style={{ width: "100%", height: "500px" }}
        />
    );
};

export default {
    title: "MultiBook",
    component: IframeMessageListener,
    args: {
        bookUrl: "testBooks/multibook-index/multibook-index.htm",
        bookPageIndex: "4",
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
