import type { StorybookConfig } from "@storybook/react-vite";
import viteConfigFn from "../vite.config";
import fs from "fs";
import path from "path";

const proxy = viteConfigFn({
    command: "serve",
    mode: "development",
}).server!.proxy;
const config: StorybookConfig = {
    stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
    // For stories that include an iframe and thus need access to bloomplayer.htm and the bundles it loads.
    // When using those stories, use `yarn watchForStorybook` to update non-storybook code.
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
        const idToBookName = {
            "2e492eb1-bcc5-4b2b-b756-6cda33e1eee4": "multibook-index",
            "2c1b71ac-f399-446d-8398-e61a8efd4e83": "multibook-target1",
        };
        const updatedProxy = {
            // setup the same proxy that we have in "vite dev" to avoid CORS issues. (THIS IS NOT WORKING)
            // Note that it requires that paths to book on BloomLibrary.org start with "s3/" in place of "https://s3.amazonaws.com/"
            // [JohnT: Normally Bloom Player uses the full URL passed to the src param of the iframe unmodified,
            // but if we do that for S3 URLs we get CORS errors. So we use these special "relative" URLs and this
            // proxy converts them back to S3 ones. Unfortunately this requires a special case in the Bloom Player
            // constructor to handle the relative URL input.  I don't know what JohnH means about it not working...
            // it works in at least many of our S3 test cases.]
            ...proxy,

            // Simulate what a bloom-player host must do to provide books via their instanceId
            // Note that this code is not giving a path all the way to the html file, so that
            // it works with paths that are asking for all the other resources, too. That works
            // so long as the html file of the book is named "index.htm".
            "/book/": {
                target: `http://localhost:6006`,
                rewrite: (path) => {
                    const bookId = path.split("/")[2];
                    const bookName = idToBookName[bookId];
                    const rewrittenPath = path.replace(
                        `/book/${bookId}`,
                        `testBooks/${bookName}`,
                    );

                    console.log(
                        `[Storybook Proxy] ${path} --> ${rewrittenPath}`,
                    );
                    return rewrittenPath;
                },
            },

            // Given a path like /bloom/c:/testBooks/multibook-index/index.htm, serve the file from the local file system
            // Needed because the browser won't let us use file:///
            // One place this is used is the story "Live from Bloom Editor".
            "/bloom/": {
                target: "http://localhost:6006",
                configure: (proxy, options) => {
                    proxy.on("proxyReq", function (proxyReq, req, res) {
                        // Stop the proxy request since we're handling it directly
                        proxyReq.destroy();

                        const requestPath =
                            req.url?.replace("/bloom/", "") || "";
                        const filePath = decodeURIComponent(requestPath);

                        try {
                            // console.log(
                            //     `[Storybook Proxy] reading ${filePath}`,
                            // );
                            const content = fs.readFileSync(filePath);
                            res.statusCode = 200;
                            res.end(content);
                        } catch (error) {
                            console.error(
                                `[Storybook Proxy] Failed to read file: ${filePath}`,
                                error,
                            );
                            res.statusCode = 404;
                            res.end();
                        }
                    });
                },
            },
        };
        return {
            ...config,
            server: { ...config.server, proxy: updatedProxy },
            addons: ["@storybook/addon-interactions"],
        };
    },
};
export default config;
