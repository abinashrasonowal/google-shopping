import { Actor, log } from 'apify';

import { ProxyHttpClient, isBlocked } from '@gs/client';
import { runSearch } from '@gs/shopping';
import { parseProduct } from '@gs/immersive';
import { parseMeta } from './meta.js';
import { buildQuery } from './query.js';
import { findMatch } from './match.js';

const DEFAULT_MAX_RESULTS = 12;

/** Resolve with the first promise that yields a truthy value; null if none do. */
function firstTruthy(promises) {
    return new Promise((resolve) => {
        let remaining = promises.length;
        if (!remaining) {
            resolve(null);
            return;
        }
        let settled = false;
        for (const p of promises) {
            p.then((val) => {
                if (settled) return;
                if (val) {
                    settled = true;
                    resolve(val);
                } else if (--remaining === 0) {
                    resolve(null);
                }
            }).catch(() => {
                if (!settled && --remaining === 0) resolve(null);
            });
        }
    });
}

/** Fetch one immersive page and check its buying options for a match. */
async function resolveProduct(product, ctx, residential) {
    const client = new ProxyHttpClient(await residential.newUrl());
    const [html, finalUrl] = await client.fetch(product.url);
    if (isBlocked(html)) return null;

    const parsed = parseProduct(html, product.url, finalUrl);
    const merchants = (parsed.buying_options || []).map((o) => o.merchant).filter(Boolean);
    log.info(`Immersive "${parsed.title}" → ${merchants.length} offers: [${merchants.join(', ')}]`);

    const match = findMatch(parsed.buying_options, ctx);
    if (!match) return null;

    log.info(`Match via ${match.reason} in "${parsed.title}" (offer: ${match.offer.merchant})`);
    return {
        reason: match.reason,
        offer: match.offer,
        product: {
            title: parsed.title,
            immersive_url: parsed.input_url,
            search_position: product.position,
            search_title: product.title,
            buying_options: parsed.buying_options,
        },
    };
}

await Actor.init();
try {
    const input = (await Actor.getInput()) || {};
    const url = input.url;
    const country = input.country || 'in';
    const maxResults = input.maxResults || DEFAULT_MAX_RESULTS;

    if (!url) throw new Error('Input field "url" is required');

    const residential = await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL'],
        countryCode: country.toUpperCase(),
    });

    // 1. Fetch the input page meta via residential proxy.
    log.info(`Fetching meta for ${url}`);
    const metaClient = new ProxyHttpClient(await residential.newUrl());
    const [metaHtml, finalUrl] = await metaClient.fetch(url);
    const meta = parseMeta(metaHtml, finalUrl, url);
    log.info(`Meta: store=${meta.store} title=${meta.title} slug=${meta.slug}`);

    // 2. Build the search query (store + title/slug, cleaned, <= 8 words).
    const query = buildQuery(meta.store, meta.title, meta.slug);
    log.info(`Search query: "${query}"`);
    if (!query) throw new Error('Could not build a search query from the page meta');

    // 3. Run the Google Shopping search via SERP proxy (shared with the shopping actor).
    const { products: searchResults, blocked } = await runSearch(query, country);
    if (blocked) throw new Error('Search request blocked by Google');

    const products = searchResults
        .filter((p) => p.url && p.url !== 'N/A')
        .slice(0, maxResults);
    log.info(`Resolving ${products.length} search results in parallel`);

    // 4. Fetch each immersive page in parallel; resolve on the FIRST matching hit.
    const ctx = { canonical: meta.canonical, slug: meta.slug, host: meta.host, store: meta.store };
    const tasks = products.map((p) => resolveProduct(p, ctx, residential).catch(() => null));
    const hit = await firstTruthy(tasks);

    // 5. Emit the result.
    const result = {
        input_url: url,
        final_url: finalUrl,
        store: meta.store,
        title: meta.title,
        canonical_url: meta.canonical,
        slug: meta.slug,
        query,
        results_considered: products.length,
        matched: Boolean(hit),
        match_reason: hit?.reason || null,
        matched_offer: hit?.offer || null,
        product: hit?.product || null,
    };
    await Actor.pushData(result);
    log.info(hit
        ? `Resolved: ${hit.offer.merchant} (${hit.offer.price ?? 'n/a'}) via ${hit.reason}`
        : 'No matching offer found across search results');
} finally {
    await Actor.exit();
}
