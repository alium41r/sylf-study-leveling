const { getDefaultConfig } = require("expo/metro-config");
const { withSylfResolver } = require("../../tooling/metro/sylf-resolver");

module.exports = withSylfResolver(getDefaultConfig(__dirname), { projectRoot: __dirname });
