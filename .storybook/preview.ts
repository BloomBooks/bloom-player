import type { Preview } from "@storybook/react";

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        initialRoute: "/story/multibook--default", // Set initial story
        options: {
            storySort: {
                order: ["MultiBook"], // Ensure MultiBook appears first
            },
        },
    },
};

export default preview;
