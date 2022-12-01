// Here we take storybook's webpack, which currently doesn't know about less,
// and add the needed rules from our webpack.core.js.

const core = require("../webpack.core.js");
module.exports = ({ config }) => {
    config.module.rules.push(...core.module.rules);
    return config;
};
