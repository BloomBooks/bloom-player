import type { StorybookConfig } from "@storybook/react-vite";
import viteConfigFn from "../vite.config";

const proxy = viteConfigFn({
    command: "serve",
    mode: "development",
}).server!.proxy;
const config: StorybookConfig = {
    stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
    // For stories that include an iframe and thus need access to bloomplayer.htm and the bundles it loads.
    // When using those stories, use `yarn buildForStorybook` to update non-storybook code.
    staticDirs: ["../dist"],
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
        const updatedProxy = {
            // setup the same proxy that we have in "vite dev" to avoid CORS issues. (THIS IS NOT WORKING)
            // Note that it requires that paths to book on BloomLibrary.org start with "s3/" in place of "https://s3.amazonaws.com/"
            ...proxy,

            // Simulate what a bloom-player host must do to provide books via their instanceId
            // Note that this code is not giving a path all the way to the html file, so that
            // it works with paths that are asking for all the other resources, too. That works
            // so long as the html file of the book is named "index.htm".
            "/book/2c1b71ac-f399-446d-8398-e61a8efd4e83": {
                target: `http://localhost:6006`,
                rewrite: (path) => {
                    const rewrittenPath = path.replace(
                        "/book/2c1b71ac-f399-446d-8398-e61a8efd4e83",
                        "/testBooks/multibook-target1",
                    );
                    // console.log(
                    //     `[Storybook Proxy] ${path} --> ${rewrittenPath}`,
                    // );
                    return rewrittenPath;
                },
            },
        };
        return { ...config, server: { ...config.server, proxy: updatedProxy } };
    },
};
export default config;
