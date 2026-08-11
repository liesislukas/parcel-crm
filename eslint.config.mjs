import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Verbatim copies of maplibre-gl@6.3.0 dist files, written into public/ by
    // `scripts/copy-maplibre-worker.mjs` on prebuild/predev. Upstream minified code — not
    // ours to lint, and linting it buries the real output in thousands of warnings.
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
