import { expect, it } from "vitest";
import { toModuleSpecifier } from "./loadDynamically";

const page = "http://localhost:8085/dist/bloomplayer.htm?url=x";

it.each([
    // An absolute url, as a book loaded from a full url gives, is used as it is
    // (it used to get a leading slash and load from the wrong place).
    [
        "http://localhost:8085/testBooks/canvas/snake.js",
        "http://localhost:8085/testBooks/canvas/snake.js",
    ],
    [
        "/testBooks/canvas/snake.js",
        "http://localhost:8085/testBooks/canvas/snake.js",
    ],
    [
        "testBooks/canvas/snake.js",
        "http://localhost:8085/dist/testBooks/canvas/snake.js",
    ],
])("resolves %s against the page to %s", (src, expected) => {
    expect(toModuleSpecifier(src, page)).toBe(expected);
});
