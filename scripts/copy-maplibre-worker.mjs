/**
 * Copy the maplibre-gl geometry worker (and the shared chunk it imports) into
 * `public/maplibre/` so `ParcelMap.tsx` can point `maplibregl.setWorkerUrl()` at a
 * same-origin, self-consistent pair.
 *
 * Why this exists — the failure it fixes is silent, which is what makes it dangerous.
 *
 * maplibre-gl 6 locates its worker at runtime with:
 *
 *     const name = url.endsWith("-dev.mjs") ? "maplibre-gl-worker-dev.mjs" : "maplibre-gl-worker.mjs";
 *     return new URL(`./${name}`, import.meta.url).href;
 *
 * Turbopack (the Next 16 default bundler) tries to resolve that `new URL` statically. It
 * cannot evaluate the template literal, collapses the conditional, and emits a reference to
 * the wrong asset — in a Next 16.3.0 production build it resolved to
 * `/_next/static/media/maplibre-gl-dev.<hash>.mjs`, the main library bundle, not a worker.
 * And the worker asset Turbopack *does* emit still contains a literal
 * `import "./maplibre-gl-shared.mjs"`, while the emitted sibling is content-hashed, so that
 * import 404s too.
 *
 * Either way the worker never boots. MapLibre raises no `error` event and logs nothing: the
 * raster basemap renders normally and every GeoJSON source just sits at zero tiles forever,
 * so the map looks fine and the parcels are simply absent. Verified against a real
 * production build before and after this fix.
 *
 * Copying both files side by side preserves the worker's relative `./maplibre-gl-shared.mjs`
 * import. The copy is regenerated from the pinned `maplibre-gl@6.3.0` on every `prebuild` and
 * `predev`, so it cannot drift from the installed package, and `public/maplibre/` is
 * gitignored — no vendored library code is committed.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"));
const out = join(process.cwd(), "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(out, { recursive: true });
for (const file of FILES) {
  await copyFile(join(dist, file), join(out, file));
}

console.log(`copied ${FILES.length} maplibre worker files from ${dist} -> ${out}`);
