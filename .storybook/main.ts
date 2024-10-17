import type { StorybookConfig } from "@storybook/react-vite";
// get the vite config one level up
import viteConfig from "../vite.config";

const config: StorybookConfig = {
    stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
    addons: [
        "@storybook/addon-onboarding",
        "@storybook/addon-links",
        "@storybook/addon-essentials",
        "@chromatic-com/storybook",
        "@storybook/addon-interactions",
    ],
    framework: {
        name: "@storybook/react-vite",
        options: {},
    },
    viteFinal: (config, options) => {
        // setup the same proxy that we have in "vite dev" to avoid CORS issues
        const server = {
            ...config.server,
            proxy: {
                ...viteConfig.server.proxy,
            },
        };

        return { ...config, server };
    },
};
export default config;
