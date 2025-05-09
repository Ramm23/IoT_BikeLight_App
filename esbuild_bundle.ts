// esbuild_bundle.ts
import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";

// Bundle the frontend TypeScript file located in public/app.ts
await esbuild.build({
  entryPoints: ["app.ts"],
  bundle: true,
  outfile: "public/app.js",
  format: "esm",           // Output as native ES module
  platform: "browser",     // Target browser environment
  target: ["es2020"],      // Modern JS target
  minify: false,
  sourcemap: true,
});

console.log("✅ ES module bundle generated at public/app.js");

// Shut down the esbuild service when done
esbuild.stop();

