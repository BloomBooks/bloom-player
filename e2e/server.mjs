// Static file server for the e2e tests (see E2E-TESTING-PLAN.md).
//
// Serves the built player from dist/ and the fixture books from public/, and
// simulates a bloom-player host that provides books by instance id by rewriting
// /book/<instanceId>/... to /testBooks/<bookName>/... (the same thing the
// storybook dev server does in .storybook/main.ts — keep the id map in sync).
//
// No dependencies beyond node builtins, so it runs the same on Windows dev
// machines and Linux CI. Started by Playwright's webServer (playwright.config.ts)
// or manually: node e2e/server.mjs

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
    path.join(repoRoot, "dist"),
    path.join(repoRoot, "public"),
    path.join(repoRoot, "e2e", "fixtures"),
];
const port = Number(process.env.BP_E2E_PORT ?? process.env.PORT ?? 8085);

if (!fs.existsSync(path.join(roots[0], "bloomplayer.htm"))) {
    console.error(
        'ERROR: dist/bloomplayer.htm not found. Run "pnpm build:standalone" first.',
    );
    process.exit(1);
}

// Keep in sync with the idToBookName map in .storybook/main.ts.
const idToBookName = {
    "2e492eb1-bcc5-4b2b-b756-6cda33e1eee4": "multibook-index",
    "2c1b71ac-f399-446d-8398-e61a8efd4e83": "multibook-target1",
};

const mimeTypes = {
    ".htm": "text/html",
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".map": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".tsv": "text/tab-separated-values",
    ".pdf": "application/pdf",
    ".distribution": "text/plain",
};

const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
    }
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
        res.writeHead(400).end();
        return;
    }

    // Host-simulation: /book/<instanceId>/... -> /testBooks/<bookName>/...
    if (urlPath.startsWith("/book/")) {
        const instanceId = urlPath.split("/")[2];
        const bookName = idToBookName[instanceId];
        if (!bookName) {
            console.log(`404 (unknown book id): ${urlPath}`);
            res.writeHead(404).end();
            return;
        }
        urlPath = urlPath.replace(`/book/${instanceId}`, `/testBooks/${bookName}`);
    }

    for (const root of roots) {
        const filePath = path.resolve(root, "." + urlPath);
        // path traversal guard
        if (filePath !== root && !filePath.startsWith(root + path.sep)) {
            continue;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const contentType =
                mimeTypes[path.extname(filePath).toLowerCase()] ??
                "application/octet-stream";
            res.writeHead(200, { "Content-Type": contentType });
            if (req.method === "HEAD") {
                res.end();
            } else {
                fs.createReadStream(filePath).pipe(res);
            }
            return;
        }
    }
    console.log(`404: ${urlPath}`);
    res.writeHead(404).end();
});

server.listen(port, () => {
    console.log(`bloom-player e2e server listening on http://localhost:${port}`);
});
