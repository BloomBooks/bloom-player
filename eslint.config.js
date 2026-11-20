import compat from "eslint-plugin-compat";

// Checks the built bundle (so our dependencies too) against the oldest supported browser, the
// "browserslist" entry in package.json (Chrome 54): ecmaVersion is the newest syntax it parses,
// and compat/compat flags browser APIs it lacks. ecmaVersion is the one value here that doesn't
// follow browserslist by itself; see "Browser support" in AGENTS.md for everything that changes
// with it.
export default [
    {
        files: ["dist/bloomPlayer.*.js"],
        languageOptions: {
            ecmaVersion: 2016 /* Chrome 54 */,
            sourceType: "script",
        },
        plugins: { compat },
        rules: { "compat/compat": "error" },
    },
];
