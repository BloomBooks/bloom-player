import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
    build: {
        outDir: "dist",
        rollupOptions: {
            input: {
                bloomPlayer: "./src/bloom-player-root.ts"
            },
            output: {
                entryFileNames: "bloomPlayer.[hash].js",
                globals: {
                    BloomPlayer: "window.BloomPlayer"
                }
            }
        }
    },
    server: {
        open: "/index-for-developing.html",
        watch: {
            ignored: ["node_modules/**"]
        },
        // This is one way to get around CORS restrictions when trying to access s3 resources.
        // It requires using '/s3' as a prefix on the url in our html files rather than
        // the actual bloomlibrary.org url.
        // Alternatively, we could always launch the browser with security disabled.
        proxy: {
            "/s3": {
                target: "https://s3.amazonaws.com",
                changeOrigin: true,
                rewrite: path => path.replace(/^\/s3/, "")
            }
        }
    },

    css: {
        preprocessorOptions: {
            less: {}
        }
    },
    plugins: [
        {
            name: "before-build",
            buildStart() {
                // TODO
                // Fetch and combine translations here
                console.log("Before build tasks");
            }
        },
        viteStaticCopy({
            targets: [
                {
                    src: "index-for-developing.html",
                    dest: "./",
                    rename: "index.html"
                },
                {
                    src: "src/bloomplayer-for-developing.htm",
                    dest: "./"
                }
            ]
        })
    ]
});
