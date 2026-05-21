import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },

        options: {
            storySort: {
                order: ["Automated"],
            },
        },
    },
};

export default preview;
