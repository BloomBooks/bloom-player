import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The built bundle must run in the oldest supported browser, the "browserslist" entry in
// package.json (see "Browser support" in AGENTS.md). This runs eslint.config.js over it.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const oldestBrowser: string = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).browserslist[0]; // e.g. "chrome 54"

let messages: { file: string; line: number; text: string; fatal: boolean }[];

test.beforeAll(async () => {
    const { ESLint } = await import("eslint"); // only when the tests run, not when listed
    // Throws "No files matching" if there is no built bundle.
    const results = await new ESLint({ cwd: repoRoot }).lintFiles([
        "dist/bloomPlayer.*.js",
    ]);
    messages = results.flatMap((result) =>
        result.messages.map((m) => ({
            file: path.basename(result.filePath),
            line: m.line,
            text: m.message,
            fatal: !!m.fatal,
        })),
    );
});

const describe = (m: (typeof messages)[number]) =>
    `${m.file}:${m.line}: ${m.text}`;

// Newer syntax, such as `?.`, fails to parse in that browser and the player hangs on
// "Loading Bloom Player...". (eslint.config.js sets which syntax it parses.)
test(`the built player bundle parses in ${oldestBrowser}`, () => {
    expect(messages.filter((m) => m.fatal).map(describe)).toEqual([]);
});

// The build adds no polyfills, so a browser API that browser lacks would throw there.
test(`the built player bundle uses no browser API newer than ${oldestBrowser}`, () => {
    expect(messages.filter((m) => !m.fatal).map(describe)).toEqual([]);
});
