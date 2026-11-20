import compat from "eslint-plugin-compat";
import fs from "node:fs";

// Checks the built bundle (so our dependencies too) against the oldest supported browser, the
// "browserslist" entry in package.json (Chrome 54): ecmaVersion is the newest syntax it parses,
// and compat/compat flags browser APIs it lacks. See "Browser support" in AGENTS.md.
const oldestBrowser = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).browserslist[0]; // e.g. "chrome 54"
// The newest ECMAScript version each Chrome milestone parses. Add a row when browserslist moves.
const ecmaVersionForChrome = { 54: 2016 };
const ecmaVersion =
    ecmaVersionForChrome[Number(/^chrome (\d+)$/i.exec(oldestBrowser)?.[1])];
if (!ecmaVersion) {
    throw new Error(
        `eslint.config.js: no ecmaVersion for browserslist "${oldestBrowser}"; add it to ecmaVersionForChrome`,
    );
}

export default [
    {
        files: ["dist/bloomPlayer.*.js"],
        languageOptions: { ecmaVersion, sourceType: "script" },
        plugins: { compat },
        rules: { "compat/compat": "error" },
    },
];
