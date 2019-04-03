var path = require("path");
var webpack = require("webpack");
var node_modules = path.resolve(__dirname, "node_modules");

var globule = require("globule");

var outputDir = "dist";

// From Bloom's webpack, it seems this is needed
// if ever our output directory does not have the same parent as our node_modules. We then
// need to resolve the babel related presets (and plugins).  This mapping function was
// suggested at https://github.com/babel/babel-loader/issues/166.
// Since our node_modules DOES have the same parent, maybe we could do without it?
function localResolve(preset) {
    return Array.isArray(preset)
        ? [require.resolve(preset[0]), preset[1]]
        : require.resolve(preset);
}

module.exports = {
    // mode must be set to either "production" or "development" in webpack 4.
    // Webpack-common is intended to be 'required' by something that provides that.
    context: __dirname,
    entry: {
        bloomPlayerControlBundle: "./src/bloom-player-root.ts"
     },

    output: {
        path: path.join(__dirname, outputDir),
        filename: "[name].js",

        libraryTarget: "var",

        //makes the exports of bloom-player-root.ts accessible via window.BloomPlayer.X,
        // e.g., window.BloomPlayer.BloomPlayerCore.
        library: "BloomPlayer"
    },

    resolve: {
        // For some reason, webpack began to complain about being given minified source.
        // alias: {
        //   "react-dom": pathToReactDom,
        //   react: pathToReact // the point of this is to use the minified version. https://christianalfoni.github.io/react-webpack-cookbook/Optimizing-rebundling.html
        // },
        modules: [
            ".",
            node_modules,
        ],
        extensions: [".js", ".jsx", ".ts", ".tsx"] //We may need to add .less here... otherwise maybe it will ignore them unless they are require()'d
    },
    plugins: [
        // don't think we need this, no jquery in bloom-player-react
        //answer on various legacy issues: http://stackoverflow.com/questions/28969861/managing-jquery-plugin-dependency-in-webpack?lq=1
        //prepend var $ = require("jquery") every time it encounters the global $ identifier or "jQuery".
        // new webpack.ProvidePlugin({
        //     $: "jquery",
        //     jQuery: "jquery",
        //     "window.jQuery": "jquery"
        // })
    ],
    optimization: {
        minimize: false,
        namedModules: true,
        splitChunks: {
            cacheGroups: {
                default: false,
            }
        }
    },
    module: {
        rules: [
            {
                test: /\.ts(x?)$/,
                use: [{ loader: "ts-loader" }]
            },
            {
                // For the most part, we're using typescript and ts-loader handles that.
                // But for things that are still in javascript, the following babel setup allows newer
                // javascript features by compiling to the version JS feature supported by the specific
                // version of FF we currently ship with.
                test: /\.(js|jsx)$/,
                exclude: [
                    /node_modules/,
                    /ckeditor/,
                    /jquery-ui/,
                    /-min/,
                    /qtip/,
                    /xregexp-all-min.js/
                ],
                use: [
                    {
                        loader: "babel-loader",
                        query: {
                            presets: [
                                // Ensure that we target our version of geckofx (mozilla/firefox)
                                [
                                    "babel-preset-env",
                                    {
                                        targets: {
                                            browsers: [
                                                "Firefox >= 45",
                                                "last 2 versions"
                                            ]
                                        }
                                    }
                                ],
                                "babel-preset-react"
                            ].map(localResolve)
                        }
                    }
                ]
            },
            {
                test: /\.less$/i,
                use: [
                    {
                        loader: "style-loader" // creates style nodes from JS strings
                    },
                    {
                        loader: "css-loader" // translates CSS into CommonJS
                    },
                    {
                        loader: "less-loader" // compiles Less to CSS
                    }
                ]
            },
            {
                test: /\.css$/,
                loader: "style-loader!css-loader"
            },
            // WOFF Font--needed?
            {
                test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
                use: {
                    loader: "url-loader",
                    options: {
                        limit: 10000,
                        mimetype: "application/font-woff"
                    }
                }
            },
            {
                // this allows things like background-image: url("myComponentsButton.svg") and have the resulting path look for the svg in the stylesheet's folder
                // the last few seem to be needed for (at least) slick-carousel to build.
                test: /\.(svg|jpg|png|ttf|eot|gif)$/,
                use: {
                    loader: "file-loader"
                }
            }
        ]
    }
};
