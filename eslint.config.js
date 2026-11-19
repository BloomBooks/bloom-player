import compat from "eslint-plugin-compat";

// Checks the built bundle (so our dependencies too) against the oldest supported browser, the
// "browserslist" entry in package.json: ES2016 is the newest syntax Chrome 54 parses, and
// compat/compat flags browser APIs it lacks. See minimumBrowserTarget in vite.config.ts.
export default [
    {
        files: ["dist/bloomPlayer.*.js"],
        languageOptions: { ecmaVersion: 2016, sourceType: "script" },
        plugins: { compat },
        rules: { "compat/compat": "error" },
    },
];
