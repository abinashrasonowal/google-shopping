#!/usr/bin/env node
// Per-actor build: esbuild bundles each actor's `src/main.js` together with its
// `@gs/shared` imports into a single self-contained `dist/main.js`, keeping the heavy
// runtime libs (apify, cheerio, got-scraping) external. It also emits a clean
// `dist/package.json` with ONLY those runtime deps — no `workspace:` protocol — which
// is what the Docker image installs (npm rejects `workspace:` specs).
//
//   node scripts/build.mjs                 # build all actors
//   node scripts/build.mjs shopping ...    # build specific actors

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACTORS = ['shopping', 'immersive', 'product-resolution'];
const RUNTIME_EXTERNAL = ['apify', 'cheerio', 'got-scraping'];

const requested = process.argv.slice(2);
const targets = requested.length ? requested : ACTORS;

for (const actor of targets) {
    if (!ACTORS.includes(actor)) throw new Error(`Unknown actor: ${actor} (expected one of ${ACTORS.join(', ')})`);
    const dir = join(ROOT, actor);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

    await esbuild.build({
        entryPoints: [join(dir, 'src/main.js')],
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        external: RUNTIME_EXTERNAL,
        outfile: join(dir, 'dist/main.js'),
        banner: { js: '// Bundled by esbuild (src/ + @gs/shared inlined). Do not edit — run `pnpm build`.' },
    });

    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(
        join(dir, 'dist/package.json'),
        `${JSON.stringify({
            name: pkg.name,
            version: pkg.version,
            type: 'module',
            dependencies: pkg.dependencies,
        }, null, 2)}\n`,
    );

    console.log(`built ${actor}/dist/main.js (+ dist/package.json)`);
}
