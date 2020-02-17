const merge = require("webpack-merge");
const common = require("./webpack.common.js");
const TerserPlugin = require("terser-webpack-plugin");

const baseExport = merge(common, {
    mode: "production",
    devtool: "source-map",
    output: {
        filename: "[name].min.js",
        // Exporting the library in umd format allows its various classes to
        // be imported in typescript using import (rather than only by
        // using require on the whole library) in a way that is consistent
        // with the d.ts files we are generating. Using various other formats
        // we found that a client could import the classes apparently successfully,
        // but they were undefined at runtime.
        // UMD is also a good universal library format that supports both AMD and commonjs.
        libraryTarget: "umd"
    },
    // This is an attempt at tree shaking. I don't think I got it working.
    // https://webpack.js.org/guides/tree-shaking#minify-the-output seems
    // to indicate that as long as package.json indicates our module is
    // sideEffects: false, and mode: is production (above), tree shaking will
    // happen. I did not find this to be the case.
    // https://wanago.io/2018/08/13/webpack-4-course-part-seven-decreasing-the-bundle-size-with-tree-shaking/
    // indicates that getting it requires a minimizer, and recommends uglifyjs.
    // However, our pre-minification bloomPlayer.js somehow contains const
    // declarations, even though our tsconfig.js has "target": "es5", which
    // I think should prevent it. UglifyJs can't handle that. Yet another site
    // recommended using TerserPlugin instead, as I have tried here. However, it
    // also doesn't seem to do tree shaking. I'm not sure whether this minifier is not
    // capable of it, or whether there is yet another setting I haven't found yet.
    // That's as far as I got before switching to second-level imports to avoid
    // most of the material-ui bloat. I'm keeping this change because it does
    // produce some reduction in the size of bloomPlayer.min.js, though I suspect it
    // is just from minification, not tree-shaking. (Currently from 770K to 351K.)
    // Note: if we do get tree-shaking working, we may need to change the sideEffects: false
    // in our own package.json to prevent shaking our CSS. See comment there.
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()]
        // usedExports: true,
        // sideEffects: true
    }
});

/* We want two different kinds of libraries.
1) The "window" to support how Bloom Desktop uses it, with "window.BloomPlayer"
2) A nice moder UMD library for Bloom Reader desktop
3) (and of course there is the iframe mode, used by Bloom Library, which uses the bloomplayer.htm)
*/
const clonedeep = require("lodash/clonedeep");
var assign = require("lodash/assign");
const windowExport = clonedeep(baseExport);
const umdExport = clonedeep(baseExport);
assign(umdExport, {
    output: {
        filename: "bloom-player.umd.min.js",
        library: "bloom-player",
        // Exporting the library in umd format allows its various classes to
        // be imported in typescript using import (rather than only by
        // using require on the whole library) in a way that is consistent
        // with the d.ts files we are generating. Using various other formats
        // we found that a client could import the classes apparently successfully,
        // but they were undefined at runtime.
        // UMD is also a good universal library format that supports both AMD and commonjs.
        libraryTarget: "umd"
    }
});

module.exports = [windowExport, umdExport];
