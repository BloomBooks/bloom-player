import type { StorybookConfig } from "@storybook/react-vite";
// get the vite config one level up
import viteConfigFn from "../vite.config";

const proxy = viteConfigFn({
    command: "serve",
    mode: "development",
}).server!.proxy;
const config: StorybookConfig = {
    stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
    staticDirs: ["../dist"], // need to get at bloomplayer.htm. Tests that need this will need to be doing a build first.
    addons: [
        "@storybook/addon-links",
        "@storybook/addon-essentials",
        "@storybook/addon-interactions",
    ],
    framework: {
        name: "@storybook/react-vite",
        options: {},
    },
    viteFinal: (config, options) => {
        // setup the same proxy that we have in "vite dev" to avoid CORS issues. (THIS IS NOT WORKING)
        // Note that it requires replacing the "https://s3.amazonaws.com/" with "s3/"
        return { ...config, server: { ...config.server, proxy } };
    },
};
export default config;
