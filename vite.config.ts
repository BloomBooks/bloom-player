import { defineConfig, UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";
import fs from "fs";
import dts from "vite-plugin-dts";

// The oldest browser engine bloom-player supports is the "browserslist" entry in package.json
// (e.g. "chrome 54"). Bloom Reader hosts the player in the Android WebView and warns when it is
// older than that (ReaderActivity.haveCurrentWebView); keep the two in step. Without a target,
// Vite leaves syntax in the bundle that an older WebView cannot parse, and the player hangs on
// "Loading Bloom Player..." (BL-17113). The target lowers JS and CSS syntax only and adds no
// polyfills, so browser APIs must be that old too; e2e/bundle-browser-support.spec.ts checks both.
const minimumBrowserTarget = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
).browserslist[0].replace(" ", ""); // "chrome 54" -> esbuild's "chrome54"

export default defineConfig(({ command, mode }) => {
    // If we're building in library mode, configure for the shared library
    if (mode === "lib") {
        return {
            build: {
                outDir: "lib",
                target: minimumBrowserTarget,
                lib: {
                    entry: path.resolve(__dirname, "src/shared/index.ts"),
                    name: "BloomPlayerShared",
                    formats: ["es"],
                    fileName: (format) => `shared.${format}.js`,
                },
                sourcemap: true,
                emptyOutDir: true,
                copyPublicDir: false, // Directly prevent copying of the public directory
            },
            plugins: [
                // Generate TypeScript declaration files
                dts({
                    // insertTypesEntry: true,
                    // rollupTypes: true,
                    // outDir: "lib/types",
                    compilerOptions: {
                        skipLibCheck: true,
                        strict: false,
                    },
                    entryRoot: path.resolve(__dirname, "src/shared"),
                }),
            ],
        };
    }

    // Regular configuration for the main application
    const config: UserConfig = {
        define: {
            __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
        },
        build: {
            outDir: "dist",
            target: minimumBrowserTarget,
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
            sourcemap: true, // Generates separate source map files
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
