import { defineConfig, UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";
import fs from "fs";

export default defineConfig(({ command }) => {
    const config: UserConfig = {
        build: {
            outDir: "dist",
            copyPublicDir: false, // Disables the copying of public/ directory during build
            rollupOptions: {
                input: {
                    bloomPlayer: "./src/bloom-player-root.ts",
                },
                output: {
                    entryFileNames: "bloomPlayer.[hash].js",
                    globals: {
                        BloomPlayer: "window.BloomPlayer",
                    },
                    // avoid the /assets folder in order to match what webpack was doing
                    assetFileNames: "[name]-[hash].[ext]",
                },
            },
            target: "esnext", // review: did this for the dynamic import
            dynamicImportVarsOptions: {
                warnOnError: true,
                exclude: [],
            },
        },

        server: {
            open: "/index-for-developing.html",
            watch: {
                ignored: ["node_modules/**"],
            },
            // This is one way to get around CORS restrictions when trying to access s3 resources.
            // It requires using '/s3' as a prefix on the url in our html files rather than
            // the actual bloomlibrary.org url.
            // Alternatively, we could always launch the browser with security disabled.
            proxy: {
                "/s3": {
                    target: "https://s3.amazonaws.com",
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/s3/, ""),
                },
            },
        },

        css: {
            preprocessorOptions: {
                less: {},
            },
        },
        plugins: [
            command === "serve" && // only want these when we do "vite dev", not when we do "vite build"
                viteStaticCopy({
                    targets: [
                        {
                            src: "index-for-developing.html",
                            dest: "./",
                            rename: "index.html",
                        },
                        {
                            src: "src/bloomplayer-for-developing.htm",
                            dest: "./",
                        },
                    ],
                }),

            useCacheBustingHashPlugin(),
        ],
    };
    return config;
});

function useCacheBustingHashPlugin() {
    return {
        name: "copy-html-plugin",
        writeBundle(options, bundle) {
            // Find the JS file
            const jsFile = Object.keys(bundle).find(
                (fileName) =>
                    fileName.startsWith("bloomPlayer") &&
                    fileName.endsWith(".js"),
            );

            // Find the CSS file
            const cssFile = Object.keys(bundle).find(
                (fileName) =>
                    fileName.startsWith("bloomPlayer") &&
                    fileName.endsWith(".css"),
            );

            if (!jsFile) {
                return;
            }

            const srcHtmlPath = path.resolve(__dirname, "src/bloomplayer.htm");
            const destHtmlPath = path.resolve(
                __dirname,
                "dist/bloomplayer.htm",
            );

            let htmlContent = fs.readFileSync(srcHtmlPath, "utf-8");

            // Replace the script tag
            htmlContent = htmlContent.replace(
                /<script src="bloomPlayer-HASH\.js"><\/script>/,
                `<script src="${jsFile}"></script>`,
            );

            if (cssFile) {
                htmlContent = htmlContent.replace(
                    /<link rel="stylesheet" href="bloomPlayer-HASH\.css"\s*\/?>/,
                    `<link rel="stylesheet" href="${cssFile}">`,
                );
            }

            fs.writeFileSync(destHtmlPath, htmlContent);
        },
    };
}
