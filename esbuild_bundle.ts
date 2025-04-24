// esbuild_bundle.ts
import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";

// Bundle the frontend TypeScript file located in public/app.ts
await esbuild.build({
  entryPoints: ["app.ts"],
  bundle: true,
  outfile: "public/app.js",
  minify: false, // Set to true if you want minification
  sourcemap: true, // Generates a sourcemap for debugging
});

console.log("Bundle generated at app.js");


// Shut down the esbuild service when done
esbuild.stop();
