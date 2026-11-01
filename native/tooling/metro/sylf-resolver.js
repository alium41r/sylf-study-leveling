// Metro resolution rules for Sylf Native (validated in Phase 2, ADR 0001):
// 1. Approved lib/ modules are consumed in place; Metro watches the Sylf repository's lib/.
// 2. Bare imports that originate in lib/ resolve from the native workspace, so stateful libraries
//    (yjs, zod, react) exist exactly once and the web app's node_modules is never used.
// 3. Server-only and web-UI-only code fails the build.
// 4. On Android/iOS, lib0/webcrypto resolves to an expo-crypto shim (Hermes has no global crypto).
const path = require("path");
const { SERVER_ONLY_SPECIFIERS, FORBIDDEN_REPO_PATHS } = require("./boundaries");

function withSylfResolver(config, { projectRoot }) {
  const workspaceRoot = path.resolve(__dirname, "../..");
  const sylfRoot = path.resolve(workspaceRoot, "..");
  const sylfLib = path.join(sylfRoot, "lib") + path.sep;
  const sylfNodeModules = path.join(sylfRoot, "node_modules") + path.sep;
  const anchor = path.join(projectRoot, "package.json");
  const lib0Shim = path.join(workspaceRoot, "packages/platform/src/shims/lib0-webcrypto.ts");

  config.watchFolders = Array.from(new Set([...(config.watchFolders || []), workspaceRoot, path.join(sylfRoot, "lib")]));
  config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules"), path.join(workspaceRoot, "node_modules")];

  const fail = (message, context) => {
    throw new Error(`[SYLF_NATIVE_BOUNDARY] ${message} (imported by ${path.relative(sylfRoot, context.originModulePath)})`);
  };
  const upstream = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = upstream || context.resolveRequest;
    if (SERVER_ONLY_SPECIFIERS.some((re) => re.test(moduleName))) fail(`Server-only package "${moduleName}" cannot enter a client bundle`, context);
    if (moduleName === "lib0/webcrypto" && platform !== "web") return { type: "sourceFile", filePath: lib0Shim };

    let request = moduleName, ctx = context;
    if (moduleName.startsWith("@/")) request = path.join(sylfRoot, moduleName.slice(2));
    const bare = !request.startsWith(".") && !path.isAbsolute(request);
    if (bare && context.originModulePath.startsWith(sylfLib)) ctx = { ...context, originModulePath: anchor };

    const result = resolve(ctx, request, platform);
    if (result && result.type === "sourceFile") {
      const file = result.filePath;
      if (file.startsWith(sylfNodeModules)) fail(`"${moduleName}" resolved into the web app's node_modules (${path.relative(sylfRoot, file)})`, context);
      if (file.startsWith(sylfRoot + path.sep) && !file.startsWith(workspaceRoot + path.sep)) {
        const rel = path.relative(sylfRoot, file).split(path.sep).join("/");
        if (!rel.startsWith("lib/") || FORBIDDEN_REPO_PATHS.some((re) => re.test(rel))) fail(`"${rel}" is outside the approved shared lib/ boundary`, context);
      }
    }
    return result;
  };
  return config;
}

module.exports = { withSylfResolver };
