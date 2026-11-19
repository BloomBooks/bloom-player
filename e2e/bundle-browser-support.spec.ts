import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The built bundle must run in the oldest supported browser (browserslist in package.json; see
// vite.config.ts). This runs eslint.config.js over it.
let messages: { file: string; line: number; text: string; fatal: boolean }[];

test.beforeAll(async () => {
    const { ESLint } = await import("eslint"); // only when the tests run, not when listed
    const repoRoot = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
    );
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

// Newer syntax, such as `?.`, fails to parse in Chrome 54 and the player hangs on
// "Loading Bloom Player...".
test("the built player bundle parses as ES2016 (Chrome 54)", () => {
    expect(messages.filter((m) => m.fatal).map(describe)).toEqual([]);
});

// The build adds no polyfills, so a browser API that Chrome 54 lacks would throw there.
test("the built player bundle uses no browser API newer than Chrome 54", () => {
    expect(messages.filter((m) => !m.fatal).map(describe)).toEqual([]);
});
