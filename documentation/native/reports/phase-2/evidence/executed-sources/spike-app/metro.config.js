// Spike-only Metro config: consume unmodified Sylf `lib/` sources while resolving every
// package from this spike's own node_modules (the web app's React 19.2 tree is never used).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sylfRoot = path.resolve(projectRoot, "../../..");
const config = getDefaultConfig(projectRoot);

config.resolver.assetExts.push("wasm");
config.watchFolders = [path.join(sylfRoot, "lib")];
const anchor = path.join(projectRoot, "index.ts");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "lib0/webcrypto") return { type: "sourceFile", filePath: path.join(projectRoot, "src/lib0-webcrypto.js") };
  if (moduleName.startsWith("@/")) return context.resolveRequest(context, path.join(sylfRoot, moduleName.slice(2)), platform);
  const bare = !moduleName.startsWith(".") && !path.isAbsolute(moduleName);
  const fromShared = !context.originModulePath.startsWith(projectRoot + path.sep);
  // Bare imports from shared lib/ files resolve as if imported from the spike root: one copy of yjs/zod/etc.
  return context.resolveRequest(bare && fromShared ? { ...context, originModulePath: anchor } : context, moduleName, platform);
};
module.exports = config;
