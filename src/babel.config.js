// currently using babel only for unit tests with jest
module.exports = {
    presets: [
        [
            "babel-preset-react",
            "@babel/preset-env",
            {
                targets: {
                    node: "current"
                }
            }
        ],
        "@babel/preset-typescript",
        "@babel/plugin-syntax-dynamic-import"
    ]
};
